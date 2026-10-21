"""
Microservicio: salud (opcional en la pauta)
Responsabilidad única: observar el estado del sistema.

  * Recibe los latidos (salud/<servicio>) que cada microservicio publica cada 15 s.
  * Mide CPU, RAM, temperatura de la placa y uptime.
  * Expone  GET http://localhost:8080/health  (solo desde la propia Raspberry).
  * Publica el resumen (retenido) en  salud/resumen; sincronizacion lo envía a la nube
    para que el dashboard muestre el estado de cada microservicio.
"""
import json
import logging
import os
import pathlib
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import paho.mqtt.client as mqtt

SERVICIO = "salud"
BROKER = os.getenv("MQTT_HOST", "mosquitto")
ESPERADOS = os.getenv("SERVICIOS_ESPERADOS", "sensor-clima,sensor-movimiento,procesamiento,sincronizacion").split(",")
TIMEOUT_LATIDO = 45

logging.basicConfig(level=logging.INFO, format=f"%(asctime)s [{SERVICIO}] %(levelname)s %(message)s")
log = logging.getLogger(SERVICIO)

latidos = {}
resumen = {}
corriendo = True
cliente = None


def detener(*_):
    global corriendo
    corriendo = False


signal.signal(signal.SIGTERM, detener)
signal.signal(signal.SIGINT, detener)


def leer_cpu():
    def muestra():
        with open("/proc/stat") as f:
            v = [int(x) for x in f.readline().split()[1:]]
        return sum(v), v[3] + v[4]  # total, idle+iowait
    t1, i1 = muestra()
    time.sleep(0.5)
    t2, i2 = muestra()
    return round(100 * (1 - (i2 - i1) / max(1, t2 - t1)), 1)


def leer_memoria():
    info = {}
    with open("/proc/meminfo") as f:
        for linea in f:
            k, v = linea.split(":")
            info[k] = int(v.split()[0])
    total, disp = info["MemTotal"], info.get("MemAvailable", info["MemFree"])
    return round(100 * (total - disp) / total, 1)


def leer_temp_placa():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return round(int(f.read()) / 1000, 1)
    except OSError:
        return None


def leer_uptime():
    with open("/proc/uptime") as f:
        return int(float(f.read().split()[0]))


def construir_resumen():
    ahora = time.time()
    servicios = {"mosquitto": {"ok": bool(cliente and cliente.is_connected())}}
    for s in ESPERADOS:
        l = latidos.get(s)
        vivo = l is not None and ahora - l["ts"] < TIMEOUT_LATIDO
        servicios[s] = {"ok": bool(vivo and l.get("ok", False)), "vivo": vivo,
                        "error": (l or {}).get("error"), "hace": None if l is None else int(ahora - l["ts"])}
        if s == "sincronizacion" and l:
            servicios[s]["internet"] = l.get("internet")
            servicios[s]["pendientes"] = l.get("pendientes")
    return {
        "ts": ahora,
        "servicios": servicios,
        "todoOk": all(v["ok"] for v in servicios.values()),
        "cpu": leer_cpu(),
        "ram": leer_memoria(),
        "tempPlaca": leer_temp_placa(),
        "uptimeSeg": leer_uptime(),
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") not in ("/health", ""):
            self.send_response(404)
            self.end_headers()
            return
        cuerpo = json.dumps(resumen or {"estado": "iniciando"}, indent=2).encode()
        self.send_response(200 if resumen.get("todoOk") else 503)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, *args):
        pass


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("salud/+", qos=0)


def on_message(client, userdata, msg):
    servicio = msg.topic.split("/", 1)[1]
    if servicio in ("resumen", SERVICIO):
        return
    try:
        latidos[servicio] = json.loads(msg.payload)
    except ValueError:
        pass


def main():
    global cliente
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=SERVICIO)
    cliente.on_connect = on_connect
    cliente.on_message = on_message
    cliente.reconnect_delay_set(1, 30)
    cliente.connect_async(BROKER, 1883, keepalive=60)
    cliente.loop_start()

    servidor = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    log.info("Endpoint de salud en :8080/health")

    while corriendo:
        resumen.clear()
        resumen.update(construir_resumen())
        cliente.publish("salud/resumen", json.dumps(resumen), qos=0, retain=True)
        if cliente.is_connected():
            pathlib.Path("/tmp/healthy").touch()
        if not resumen["todoOk"]:
            caidos = [k for k, v in resumen["servicios"].items() if not v["ok"]]
            log.warning("Servicios con problemas: %s", ", ".join(caidos))
        time.sleep(15)

    servidor.shutdown()
    cliente.loop_stop()


if __name__ == "__main__":
    main()
