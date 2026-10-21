"""
Microservicio: sensor-clima (adquisición)
Responsabilidad única: leer temperatura y humedad del DHT11/DHT22 conectado a GPIO17
y publicar cada lectura en el tópico MQTT  sensores/clima.

La lectura se hace con el driver del kernel (dtoverlay=dht11,gpiopin=17), que expone
el sensor en /sys/bus/iio/devices. Es mucho más estable que leer el DHT desde Python
y no requiere modo privilegiado.

Escucha  config/dispositivo  para aplicar intervalo y activación SIN reiniciarse.
"""
import glob
import json
import logging
import os
import pathlib
import signal
import time

import paho.mqtt.client as mqtt

SERVICIO = "sensor-clima"
BROKER = os.getenv("MQTT_HOST", "mosquitto")
IIO_BASE = os.getenv("IIO_BASE", "/sys/bus/iio/devices")

logging.basicConfig(level=logging.INFO, format=f"%(asctime)s [{SERVICIO}] %(levelname)s %(message)s")
log = logging.getLogger(SERVICIO)

config = {
    "intervaloClimaSeg": int(os.getenv("INTERVALO_CLIMA_SEG", "10")),
    "sensorClimaActivo": True,
}
corriendo = True
ultimo_error = None


def detener(*_):
    global corriendo
    corriendo = False


signal.signal(signal.SIGTERM, detener)
signal.signal(signal.SIGINT, detener)


def buscar_sensor():
    """Devuelve la carpeta IIO del DHT (la que tiene temperatura y humedad)."""
    for d in sorted(glob.glob(f"{IIO_BASE}/iio:device*")):
        if os.path.exists(f"{d}/in_temp_input") and os.path.exists(f"{d}/in_humidityrelative_input"):
            return d
    return None


def leer_dht(dispositivo, intentos=5):
    """El DHT falla a veces (checksum/timeout): se reintenta respetando 2 s entre lecturas."""
    global ultimo_error
    for _ in range(intentos):
        try:
            with open(f"{dispositivo}/in_temp_input") as f:
                temp = int(f.read().strip()) / 1000.0
            with open(f"{dispositivo}/in_humidityrelative_input") as f:
                hum = int(f.read().strip()) / 1000.0
            if -40 <= temp <= 80 and 0 <= hum <= 100:
                ultimo_error = None
                return round(temp, 1), round(hum, 1)
            ultimo_error = f"valor fuera de rango t={temp} h={hum}"
        except (OSError, ValueError) as e:
            ultimo_error = str(e)
        time.sleep(2.1)
    return None


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        log.info("Conectado al broker")
        client.subscribe("config/dispositivo", qos=1)
    else:
        log.warning("Conexión rechazada: %s", reason_code)


def on_message(client, userdata, msg):
    try:
        nueva = json.loads(msg.payload)
        if "intervaloClimaSeg" in nueva:
            config["intervaloClimaSeg"] = max(3, int(nueva["intervaloClimaSeg"]))
        if "sensorClimaActivo" in nueva:
            config["sensorClimaActivo"] = bool(nueva["sensorClimaActivo"])
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

    dispositivo = None
    proxima_lectura = 0.0
    ultimo_latido = 0.0

    while corriendo:
        ahora = time.time()

        if ahora - ultimo_latido >= 15:
            ok = cliente.is_connected() and dispositivo is not None and ultimo_error is None
            cliente.publish(f"salud/{SERVICIO}", json.dumps({
                "servicio": SERVICIO, "ts": ahora, "ok": ok,
                "activo": config["sensorClimaActivo"], "error": ultimo_error,
            }), qos=0)
            if cliente.is_connected():
                pathlib.Path("/tmp/healthy").touch()
            ultimo_latido = ahora

        if config["sensorClimaActivo"] and ahora >= proxima_lectura:
            if dispositivo is None:
                dispositivo = buscar_sensor()
                if dispositivo is None:
                    log.error("No se encontró el DHT en %s. ¿Agregaste dtoverlay=dht11,gpiopin=17 y reiniciaste?", IIO_BASE)
            if dispositivo:
                lectura = leer_dht(dispositivo)
                if lectura:
                    temp, hum = lectura
                    cliente.publish("sensores/clima", json.dumps({"temp": temp, "hum": hum, "ts": time.time()}), qos=1)
                    log.info("temp=%.1f°C hum=%.1f%%", temp, hum)
                else:
                    log.warning("Lectura fallida: %s", ultimo_error)
            proxima_lectura = ahora + max(3, config["intervaloClimaSeg"])

        time.sleep(0.5)

    cliente.loop_stop()
    cliente.disconnect()


if __name__ == "__main__":
    main()
