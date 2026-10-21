#!/usr/bin/env bash
# Preparación de la Raspberry Pi 3 (Raspberry Pi OS 64 bits). Ejecutar UNA vez:
#   cd smart-campus-iot/raspberry && chmod +x instalar.sh && ./instalar.sh
set -euo pipefail

CONFIG_TXT=/boot/firmware/config.txt
[ -f "$CONFIG_TXT" ] || CONFIG_TXT=/boot/config.txt
DHT_PIN="${DHT_PIN:-17}"

echo "==> 1/5 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
sudo systemctl enable --now docker          # el sistema completo arranca solo al encender

echo "==> 2/5 Driver del DHT en GPIO${DHT_PIN} (kernel / IIO)"
if ! grep -q "^dtoverlay=dht11" "$CONFIG_TXT"; then
  echo "dtoverlay=dht11,gpiopin=${DHT_PIN}" | sudo tee -a "$CONFIG_TXT"
  REINICIAR=1
fi

echo "==> 3/5 Swap de 1 GB (la Pi 3 tiene solo 1 GB de RAM)"
if [ -f /etc/dphys-swapfile ]; then
  sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
  sudo systemctl restart dphys-swapfile || true
elif ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
fi

echo "==> 4/5 Hora sincronizada (necesaria para HTTPS y para los minutos de cada lectura)"
sudo timedatectl set-ntp true || true

echo "==> 5/5 Archivo .env"
[ -f .env ] || { cp .env.example .env; echo "   Edita .env con API_URL y DEVICE_TOKEN:  nano .env"; }

if [ "${REINICIAR:-0}" = "1" ]; then
  echo
  echo "Se agregó el overlay del DHT. REINICIA la Raspberry (sudo reboot) y luego:"
  echo "   cd $(pwd) && docker compose up -d --build"
else
  echo
  echo "Listo. Ahora:  docker compose up -d --build"
fi
