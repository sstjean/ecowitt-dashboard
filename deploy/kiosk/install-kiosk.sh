#!/usr/bin/env bash
# One-time kiosk setup for the wall-mounted Surface Pro 3 (Ubuntu).
# Run ON the Surface (not the prod host):  bash install-kiosk.sh
set -euo pipefail

KIOSK_DIR="${HOME}/kiosk"
AUTOSTART_DIR="${HOME}/.config/autostart"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing Chromium + helpers"
sudo apt update
sudo apt install -y chromium-browser unclutter curl x11-xserver-utils

echo "==> Placing kiosk launcher in ${KIOSK_DIR}"
mkdir -p "${KIOSK_DIR}"
install -m 0755 "${SRC_DIR}/start-kiosk.sh" "${KIOSK_DIR}/start-kiosk.sh"

echo "==> Enabling autostart"
mkdir -p "${AUTOSTART_DIR}"
install -m 0644 "${SRC_DIR}/ecowitt-kiosk.desktop" "${AUTOSTART_DIR}/ecowitt-kiosk.desktop"

echo "==> Disabling automatic screen blanking/sleep (GNOME)"
gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' 2>/dev/null || true

echo
echo "Done. Log out and back in (or reboot) to launch the kiosk."
echo "Dashboard: http://192.168.10.5:8090/"
