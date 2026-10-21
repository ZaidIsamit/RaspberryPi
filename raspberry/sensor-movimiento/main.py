"""
Microservicio: sensor-movimiento (adquisición)
Responsabilidad única: leer el sensor PIR HC-SR501 en GPIO18 (BCM) y publicar,
cada segundo, en  sensores/movimiento:
  {"activo": bool, "flancos": int, "ts": float}
  - activo:  hubo movimiento en algún momento de ese segundo
  - flancos: cantidad de detecciones nuevas (subidas 0->1) en ese segundo

Usa libgpiod sobre /dev/gpiochip0 (mapeado en docker-compose, sin modo privilegiado).
Escucha  config/dispositivo  para activar/desactivar el sensor sin reiniciarse.
"""
import json
import logging
import os
import pathlib
import signal
import time

import gpiod
from gpiod.line import Direction, Value
import paho.mqtt.client as mqtt

SERVICIO = "sensor-movimiento"
BROKER = os.getenv("MQTT_HOST", "mosquitto")
CHIP = os.getenv("GPIO_CHIP", "/dev/gpiochip0")
PIN = int(os.getenv("GPIO_PIR", "18"))
MUESTREO_SEG = 0.1  # se mira el pin 10 veces por segundo

logging.basicConfig(level=logging.INFO, format=f"%(asctime)s [{SERVICIO}] %(levelname)s %(message)s")
log = logging.getLogger(SERVICIO)

config = {"sensorMovimientoActivo": True}
corriendo = True


def detener(*_):
    global corriendo
    corriendo = False


signal.signal(signal.SIGTERM, detener)
signal.signal(signal.SIGINT, detener)


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        log.info("Conectado al broker")
        client.subscribe("config/dispositivo", qos=1)


def on_message(client, userdata, msg):
    try:
        nueva = json.loads(msg.payload)
        if "sensorMovimientoActivo" in nueva:
            config["sensorMovimientoActivo"] = bool(nueva["sensorMovimientoActivo"])
            log.info("Configuración aplicada en caliente: %s", config)
    except (ValueError, TypeError) as e:
        log.warning("Configuración inválida ignorada: %s", e)


def main():
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=SERVICIO)
    cliente.on_connect = on_connect
    cliente.on_message = on_message
    cliente.reconnect_delay_set(1, 30)
    cliente.connect_async(BROKER, 1883, keepalive=60)
    cliente.loop_start()

    log.info("Abriendo %s línea %d (el PIR necesita ~60 s de calentamiento al energizarse)", CHIP, PIN)
    solicitud = gpiod.request_lines(
        CHIP,
        consumer=SERVICIO,
        config={PIN: gpiod.LineSettings(direction=Direction.INPUT)},
    )

    anterior = False
    activo_en_ventana = False
    flancos = 0
    inicio_ventana = time.time()
    ultimo_latido = 0.0
    error = None

    try:
        while corriendo:
            try:
                valor = solicitud.get_value(PIN) == Value.ACTIVE
                error = None
            except OSError as e:
                valor, error = False, str(e)

            if valor and not anterior:
                flancos += 1
            activo_en_ventana = activo_en_ventana or valor
            anterior = valor

            ahora = time.time()
            if ahora - inicio_ventana >= 1.0:
                if config["sensorMovimientoActivo"]:
                    cliente.publish("sensores/movimiento", json.dumps({
                        "activo": activo_en_ventana, "flancos": flancos, "ts": ahora,
                    }), qos=0)
                    if flancos:
                        log.info("Movimiento detectado")
                activo_en_ventana, flancos, inicio_ventana = False, 0, ahora

            if ahora - ultimo_latido >= 15:
                cliente.publish(f"salud/{SERVICIO}", json.dumps({
                    "servicio": SERVICIO, "ts": ahora, "ok": cliente.is_connected() and error is None,
                    "activo": config["sensorMovimientoActivo"], "error": error,
                }))
                if cliente.is_connected():
                    pathlib.Path("/tmp/healthy").touch()
                ultimo_latido = ahora

            time.sleep(MUESTREO_SEG)
    finally:
        solicitud.release()
        cliente.loop_stop()
        cliente.disconnect()


if __name__ == "__main__":
    main()
