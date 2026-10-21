"""
Microservicio: procesamiento
Responsabilidad única: transformar lecturas crudas en información útil.

Entrada (MQTT):  sensores/clima, sensores/movimiento, config/dispositivo
Salida  (MQTT):  procesado/minuto  -> 1 resumen por minuto (lo que se guarda en la nube)
                 alertas/nueva     -> solo cuando una condición CAMBIA (inicia o se resuelve)

Qué hace:
  1. Valida y filtra (rangos físicos y saltos imposibles del DHT).
  2. Agrega por minuto: promedio/mín/máx de temperatura y humedad, % del minuto con presencia,
     cantidad de detecciones.
  3. Combina ambos sensores: sala ocupada/vacía, índice de confort (0-100) y un estado legible
     (ej. "Ocupada - calurosa").
  4. Detecta umbrales configurables desde la web (temperatura, humedad, presencia fuera de horario).

Agregar en el dispositivo reduce las escrituras en Firestore de ~8.640+86.400/día a 1.440/día.
"""
import json
import logging
import os
import pathlib
import signal
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import paho.mqtt.client as mqtt

SERVICIO = "procesamiento"
BROKER = os.getenv("MQTT_HOST", "mosquitto")
TZ = ZoneInfo(os.getenv("TZ_LOCAL", "America/Santiago"))

logging.basicConfig(level=logging.INFO, format=f"%(asctime)s [{SERVICIO}] %(levelname)s %(message)s")
log = logging.getLogger(SERVICIO)

config = {
    "umbralTempMax": 26.0,
    "umbralTempMin": 16.0,
    "umbralHumMax": 70.0,
    "umbralOcupacion": 0.10,   # fracción del minuto con presencia para considerar la sala ocupada
    "horaInicio": 8,           # horario permitido de uso (hora local)
    "horaFin": 22,
}
lock = threading.Lock()
corriendo = True


def detener(*_):
    global corriendo
    corriendo = False


signal.signal(signal.SIGTERM, detener)
signal.signal(signal.SIGINT, detener)


def nuevo_bucket(minuto):
    return {"minuto": minuto, "temps": [], "hums": [], "segTotal": 0, "segActivos": 0, "flancos": 0}


estado = {"bucket": nuevo_bucket(int(time.time() // 60)), "ultimaTemp": None, "alertasActivas": set()}


# ---------------------------------------------------------------- lógica pura (testeable)
def indice_confort(temp, hum):
    """100 = ideal (20-24 °C y 40-60 % HR). Resta puntos por cada grado / punto fuera del rango."""
    if temp is None or hum is None:
        return None
    d_temp = max(0.0, 20 - temp, temp - 24)
    d_hum = max(0.0, 40 - hum, hum - 60)
    return int(max(0, min(100, round(100 - 12 * d_temp - 1.5 * d_hum))))


def resumir(b, cfg):
    """Convierte el bucket de un minuto en el documento que se enviará a la nube."""
    temps, hums = b["temps"], b["hums"]
    if not temps and b["segTotal"] == 0:
        return None
    temp = round(sum(temps) / len(temps), 1) if temps else None
    hum = round(sum(hums) / len(hums), 1) if hums else None
    presencia = round(b["segActivos"] / b["segTotal"], 2) if b["segTotal"] else None
    ocupada = bool(presencia is not None and (presencia >= cfg["umbralOcupacion"] or b["flancos"] >= 2))
    confort = indice_confort(temp, hum)

    if not ocupada:
        etiqueta = "Vacía"
    elif temp is not None and temp > cfg["umbralTempMax"]:
        etiqueta = "Ocupada - calurosa"
    elif temp is not None and temp < cfg["umbralTempMin"]:
        etiqueta = "Ocupada - fría"
    elif hum is not None and hum > cfg["umbralHumMax"]:
        etiqueta = "Ocupada - húmeda (ventilar)"
    else:
        etiqueta = "Ocupada - confortable"

    return {
        "id": str(b["minuto"]),          # id determinístico -> reenvíos no generan duplicados
        "ts": b["minuto"] * 60,          # epoch (s) del inicio del minuto
        "t": temp,
        "tMin": min(temps) if temps else None,
        "tMax": max(temps) if temps else None,
        "h": hum,
        "nClima": len(temps),
        "pres": presencia,               # 0..1 fracción del minuto con presencia
        "mov": b["flancos"],             # detecciones en el minuto
        "ocup": ocupada,
        "conf": confort,
        "estado": etiqueta,
    }


def evaluar_alertas(doc, cfg, activas, ahora_local):
    """Devuelve alertas SOLO cuando una condición empieza o termina (ahorra escrituras)."""
    condiciones = {
        "TEMP_ALTA": (doc["t"] is not None and doc["t"] > cfg["umbralTempMax"],
                      f"Temperatura {doc['t']} °C sobre el máximo {cfg['umbralTempMax']} °C", doc["t"]),
        "TEMP_BAJA": (doc["t"] is not None and doc["t"] < cfg["umbralTempMin"],
                      f"Temperatura {doc['t']} °C bajo el mínimo {cfg['umbralTempMin']} °C", doc["t"]),
        "HUM_ALTA": (doc["h"] is not None and doc["h"] > cfg["umbralHumMax"],
                     f"Humedad {doc['h']} % sobre el máximo {cfg['umbralHumMax']} %", doc["h"]),
        "FUERA_HORARIO": (doc["ocup"] and not (cfg["horaInicio"] <= ahora_local.hour < cfg["horaFin"]),
                          f"Presencia detectada fuera del horario {cfg['horaInicio']}:00-{cfg['horaFin']}:00",
                          doc["pres"]),
    }
    salida = []
    for tipo, (cumple, mensaje, valor) in condiciones.items():
        if cumple and tipo not in activas:
            activas.add(tipo)
            salida.append({"id": f"{doc['id']}-{tipo}", "tipo": tipo, "estado": "activa",
                           "mensaje": mensaje, "valor": valor, "ts": doc["ts"]})
        elif not cumple and tipo in activas:
            activas.discard(tipo)
            salida.append({"id": f"{doc['id']}-{tipo}-fin", "tipo": tipo, "estado": "resuelta",
                           "mensaje": f"{tipo} normalizada", "valor": valor, "ts": doc["ts"]})
    return salida


# ---------------------------------------------------------------- MQTT
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        log.info("Conectado al broker")
        client.subscribe([("sensores/clima", 1), ("sensores/movimiento", 0), ("config/dispositivo", 1)])


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload)
    except ValueError:
        return
    with lock:
        b = estado["bucket"]
        if msg.topic == "sensores/clima":
            t, h = data.get("temp"), data.get("hum")
            if not isinstance(t, (int, float)) or not isinstance(h, (int, float)):
                return
            if not (-40 <= t <= 80 and 0 <= h <= 100):
                return
            ultima = estado["ultimaTemp"]
            if ultima is not None and abs(t - ultima) > 8:   # salto imposible en segundos: lectura corrupta
                log.warning("Lectura descartada por salto brusco: %.1f -> %.1f", ultima, t)
                estado["ultimaTemp"] = t  # si se repite, se acepta la siguiente
                return
            estado["ultimaTemp"] = t
            b["temps"].append(float(t))
            b["hums"].append(float(h))
        elif msg.topic == "sensores/movimiento":
            b["segTotal"] += 1
            b["segActivos"] += 1 if data.get("activo") else 0
            b["flancos"] += int(data.get("flancos", 0))
        elif msg.topic == "config/dispositivo":
            for k in ("umbralTempMax", "umbralTempMin", "umbralHumMax", "umbralOcupacion"):
                if k in data:
                    config[k] = float(data[k])
            for k in ("horaInicio", "horaFin"):
                if k in data:
                    config[k] = int(data[k])
            log.info("Umbrales aplicados en caliente: %s", config)


def main():
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=SERVICIO)
    cliente.on_connect = on_connect
    cliente.on_message = on_message
    cliente.reconnect_delay_set(1, 30)
    cliente.connect_async(BROKER, 1883, keepalive=60)
    cliente.loop_start()
    ultimo_latido = 0.0

    while corriendo:
        ahora = time.time()
        minuto_actual = int(ahora // 60)
        cerrado = None
        with lock:
            if minuto_actual > estado["bucket"]["minuto"]:
                cerrado = estado["bucket"]
                estado["bucket"] = nuevo_bucket(minuto_actual)
                cfg = dict(config)
        if cerrado:
            doc = resumir(cerrado, cfg)
            if doc:
                cliente.publish("procesado/minuto", json.dumps(doc), qos=1)
                log.info("Minuto %s: %s", doc["id"], doc["estado"])
                for alerta in evaluar_alertas(doc, cfg, estado["alertasActivas"], datetime.now(TZ)):
                    cliente.publish("alertas/nueva", json.dumps(alerta), qos=1)
                    log.warning("Alerta %s %s", alerta["tipo"], alerta["estado"])

        if ahora - ultimo_latido >= 15:
            cliente.publish(f"salud/{SERVICIO}", json.dumps({"servicio": SERVICIO, "ts": ahora,
                                                             "ok": cliente.is_connected()}))
            if cliente.is_connected():
                pathlib.Path("/tmp/healthy").touch()
            ultimo_latido = ahora
        time.sleep(1)

    cliente.loop_stop()
    cliente.disconnect()


if __name__ == "__main__":
    main()
