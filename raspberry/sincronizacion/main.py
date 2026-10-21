"""
Microservicio: sincronizacion
Responsabilidad única: comunicar el dispositivo con la nube.

  * Guarda todo lo que hay que enviar (procesado/minuto y alertas/nueva) en un buffer SQLite
    persistente (/data/buffer.db). Si no hay Internet, los datos se quedan ahí.
  * Cada INTERVALO_ENVIO_SEG envía un LOTE a  POST {API_URL}/api/v1/ingest  (solo HTTPS saliente).
    Solo borra del buffer lo que la API confirmó. Como cada documento tiene id determinístico,
    un reenvío nunca crea duplicados en Firestore.
  * Cada CONFIG_POLL_SEG consulta  GET {API_URL}/api/v1/device/config  y publica la configuración
    vigente (retenida) en  config/dispositivo  para que los demás servicios la apliquen en caliente.
  * Incluye en cada envío el resumen de salud (salud/resumen) para que la web muestre el estado.
"""
import json
import logging
import os
import pathlib
import signal
import sqlite3
import threading
import time

import paho.mqtt.client as mqtt
import requests

SERVICIO = "sincronizacion"
BROKER = os.getenv("MQTT_HOST", "mosquitto")
API_URL = os.getenv("API_URL", "").rstrip("/")
TOKEN = os.getenv("DEVICE_TOKEN", "")
DB_PATH = os.getenv("DB_PATH", "/data/buffer.db")
LOTE_MAX = 200

logging.basicConfig(level=logging.INFO, format=f"%(asctime)s [{SERVICIO}] %(levelname)s %(message)s")
log = logging.getLogger(SERVICIO)

if not API_URL.startswith("https://") and os.getenv("PERMITIR_HTTP") != "1":
    raise SystemExit("API_URL debe comenzar con https:// (el dispositivo solo inicia conexiones HTTPS)")
if not TOKEN or TOKEN == "pega-aqui-el-token":
    raise SystemExit("Falta DEVICE_TOKEN en .env (se genera en la plataforma web)")

config = {
    "intervaloEnvioSeg": int(os.getenv("INTERVALO_ENVIO_SEG", "60")),
    "configPollSeg": int(os.getenv("CONFIG_POLL_SEG", "30")),
}
salud_resumen = {}
db_lock = threading.Lock()
corriendo = True
estado_red = {"ok": False, "error": None, "ultimoEnvio": None}


def detener(*_):
    global corriendo
    corriendo = False


signal.signal(signal.SIGTERM, detener)
signal.signal(signal.SIGINT, detener)

# ---------------------------------------------------------------- buffer local
pathlib.Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute("PRAGMA journal_mode=WAL")
db.execute("""CREATE TABLE IF NOT EXISTS pendientes (
                id TEXT PRIMARY KEY, tipo TEXT NOT NULL, payload TEXT NOT NULL, creado REAL NOT NULL)""")
db.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)")
db.commit()


def encolar(tipo, doc):
    with db_lock:
        # INSERT OR IGNORE: si el mismo id llega dos veces, se guarda una sola
        db.execute("INSERT OR IGNORE INTO pendientes VALUES (?,?,?,?)",
                   (f"{tipo}:{doc['id']}", tipo, json.dumps(doc), time.time()))
        db.commit()


def tomar_lote():
    with db_lock:
        return db.execute("SELECT id, tipo, payload FROM pendientes ORDER BY creado LIMIT ?",
                          (LOTE_MAX,)).fetchall()


def borrar(ids):
    if not ids:
        return
    with db_lock:
        db.executemany("DELETE FROM pendientes WHERE id = ?", [(i,) for i in ids])
        db.commit()


def contar_pendientes():
    with db_lock:
        return db.execute("SELECT COUNT(*) FROM pendientes").fetchone()[0]


def guardar_config_local(cfg):
    with db_lock:
        db.execute("INSERT OR REPLACE INTO kv VALUES ('config', ?)", (json.dumps(cfg),))
        db.commit()


def leer_config_local():
    with db_lock:
        fila = db.execute("SELECT v FROM kv WHERE k='config'").fetchone()
    return json.loads(fila[0]) if fila else None


# ---------------------------------------------------------------- MQTT
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        log.info("Conectado al broker")
        client.subscribe([("procesado/minuto", 1), ("alertas/nueva", 1), ("salud/resumen", 0)])
        cfg = leer_config_local()
        if cfg:  # tras un reinicio sin Internet se sigue usando la última configuración conocida
            client.publish("config/dispositivo", json.dumps(cfg), qos=1, retain=True)


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload)
    except ValueError:
        return
    if msg.topic == "procesado/minuto":
        encolar("lectura", data)
    elif msg.topic == "alertas/nueva":
        encolar("alerta", data)
    elif msg.topic == "salud/resumen":
        salud_resumen.clear()
        salud_resumen.update(data)


# ---------------------------------------------------------------- HTTP (solo saliente)
sesion = requests.Session()
sesion.headers.update({"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})


def enviar_lote():
    filas = tomar_lote()
    lecturas = [json.loads(p) for (_, t, p) in filas if t == "lectura"]
    alertas = [json.loads(p) for (_, t, p) in filas if t == "alerta"]
    cuerpo = {
        "lecturas": lecturas,
        "alertas": alertas,
        "salud": {**salud_resumen, "pendientesBuffer": contar_pendientes()},
    }
    try:
        r = sesion.post(f"{API_URL}/api/v1/ingest", json=cuerpo, timeout=15)
    except requests.RequestException as e:
        estado_red.update(ok=False, error=f"sin conexión: {e.__class__.__name__}")
        log.warning("Sin conexión; %d registros quedan en el buffer local", len(filas))
        return
    if r.status_code == 200:
        resp = r.json()
        # Se borran los aceptados y también los rechazados por validación (no tiene sentido reintentarlos)
        procesados = set(resp.get("aceptados", [])) | set(resp.get("rechazados", []))
        borrar([fid for (fid, t, _) in filas if fid.split(":", 1)[1] in procesados])
        estado_red.update(ok=True, error=None, ultimoEnvio=time.time())
        log.info("Lote enviado: %d lecturas, %d alertas (rechazados: %d)",
                 len(lecturas), len(alertas), len(resp.get("rechazados", [])))
    elif r.status_code in (401, 403):
        estado_red.update(ok=False, error="token inválido o revocado")
        log.error("La API rechazó el token (%s). Genera uno nuevo en la web.", r.status_code)
    else:
        estado_red.update(ok=False, error=f"HTTP {r.status_code}")
        log.warning("Error de la API %s: %s", r.status_code, r.text[:200])


def obtener_config(cliente):
    try:
        r = sesion.get(f"{API_URL}/api/v1/device/config", timeout=10)
    except requests.RequestException:
        return
    if r.status_code != 200:
        return
    cfg = r.json().get("config", {})
    if cfg != leer_config_local():
        log.info("Nueva configuración desde la web: %s", cfg)
        guardar_config_local(cfg)
        cliente.publish("config/dispositivo", json.dumps(cfg), qos=1, retain=True)
    if "intervaloEnvioSeg" in cfg:
        config["intervaloEnvioSeg"] = max(10, int(cfg["intervaloEnvioSeg"]))


def main():
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=SERVICIO, clean_session=False)
    cliente.on_connect = on_connect
    cliente.on_message = on_message
    cliente.reconnect_delay_set(1, 30)
    cliente.connect_async(BROKER, 1883, keepalive=60)
    cliente.loop_start()

    proximo_envio = time.time() + 5
    proxima_config = time.time() + 2
    ultimo_latido = 0.0

    while corriendo:
        ahora = time.time()
        if ahora >= proxima_config:
            obtener_config(cliente)
            proxima_config = ahora + config["configPollSeg"]
        if ahora >= proximo_envio:
            enviar_lote()
            # si quedó mucho en el buffer (volvió la conexión), se vacía más rápido
            proximo_envio = ahora + (5 if contar_pendientes() >= LOTE_MAX else config["intervaloEnvioSeg"])
        if ahora - ultimo_latido >= 15:
            cliente.publish(f"salud/{SERVICIO}", json.dumps({
                "servicio": SERVICIO, "ts": ahora, "ok": cliente.is_connected(),
                "internet": estado_red["ok"], "error": estado_red["error"],
                "pendientes": contar_pendientes(),
            }))
            if cliente.is_connected():   # sin Internet sigue sano: está bufferizando, que es su trabajo
                pathlib.Path("/tmp/healthy").touch()
            ultimo_latido = ahora
        time.sleep(1)

    cliente.loop_stop()
    cliente.disconnect()
    db.close()


if __name__ == "__main__":
    main()
