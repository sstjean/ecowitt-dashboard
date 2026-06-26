#!/usr/bin/env bash
# Idempotent installer for the Ecowitt weather kiosk on kitchen-kiosk.
# Run as root:  sudo bash setup-kiosk.sh
#
# Tier 1 (self-healing display) + Tier 2 (stay-alive hardening).
# Does NOT touch the display server / GNOME session itself (that is Tier 3,
# which carries remote-recovery risk and should be done on-site).
set -euo pipefail

KIOSK_USER=kiosk
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
KIOSK_UID="$(id -u "$KIOSK_USER")"
AUTOSTART_DIR="$KIOSK_HOME/.config/autostart"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DASH_URL="http://192.168.10.5:8090/"

echo "==> [1/7] Installing self-healing launch wrapper"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0755 \
  "$SRC_DIR/kiosk-weather.sh" "$KIOSK_HOME/kiosk-weather.sh"

echo "==> [2/7] Pointing chromium autostart at the wrapper (weather dashboard)"
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0700 "$AUTOSTART_DIR"
DESKTOP="$AUTOSTART_DIR/chromium-browser.desktop"
{
  echo "[Desktop Entry]"
  echo "Type=Application"
  echo "Exec=$KIOSK_HOME/kiosk-weather.sh"
  echo "Hidden=false"
  echo "NoDisplay=false"
  echo "X-GNOME-Autostart-enabled=true"
  echo "Name=Ecowitt Weather Kiosk"
  echo "Comment=Self-healing full-screen weather dashboard"
} > "$DESKTOP"
chown "$KIOSK_USER:$KIOSK_USER" "$DESKTOP"
chmod 0644 "$DESKTOP"

echo "==> [3/7] Disabling the competing firefox autostart"
if [ -f "$AUTOSTART_DIR/firefox.desktop" ]; then
  mv -f "$AUTOSTART_DIR/firefox.desktop" "$AUTOSTART_DIR/firefox.desktop.disabled"
fi

echo "==> [4/7] Disabling screen blank / idle / lock / sleep for the kiosk session"
RUN_BUS="unix:path=/run/user/$KIOSK_UID/bus"
as_kiosk() { runuser -u "$KIOSK_USER" -- env DBUS_SESSION_BUS_ADDRESS="$RUN_BUS" "$@"; }
as_kiosk gsettings set org.gnome.desktop.session idle-delay 'uint32 0' || true
as_kiosk gsettings set org.gnome.desktop.screensaver lock-enabled false || true
as_kiosk gsettings set org.gnome.desktop.screensaver idle-activation-enabled false || true
as_kiosk gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' || true
as_kiosk gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' || true
as_kiosk gsettings set org.gnome.settings-daemon.plugins.power idle-dim false || true

echo "==> [5/7] Holding chromium snap auto-refresh (no mid-display restarts)"
if snap list chromium >/dev/null 2>&1; then
  snap refresh --hold chromium || true
fi

echo "==> [6/7] Enabling unattended security upgrades with a 04:00 auto-reboot"
cat > /etc/apt/apt.conf.d/52kiosk-auto-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF

echo "==> [7/7] Installing nightly browser refresh timer (03:30)"
cat > /etc/systemd/system/kiosk-refresh.service <<EOF
[Unit]
Description=Nightly Ecowitt kiosk browser refresh (sheds memory leaks)

[Service]
Type=oneshot
ExecStart=/usr/bin/pkill -u $KIOSK_USER chromium
SuccessExitStatus=0 1
EOF
cat > /etc/systemd/system/kiosk-refresh.timer <<'EOF'
[Unit]
Description=Restart the kiosk browser nightly at 03:30

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=false

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now kiosk-refresh.timer

echo
echo "Done. Kiosk will show $DASH_URL after the next session start."
echo "To apply now without rebooting, restart the kiosk graphical session"
echo "or run: sudo pkill -u $KIOSK_USER firefox chromium  (autostart relaunches)"
