#!/usr/bin/env bash
# deploy/kiosk/lib/network.sh — sourced by provision.sh.
# configure_network: system-owned main WLAN profile that survives headless boot
# (psk-flags 0, autoconnect priority 10, powersave off) and an IoT profile that
# never auto-joins. The PSK is written ONLY to the 0600 system-connection file
# and is never logged (contracts/network-profile.md, data-model.md §E6).

# True if an nmcli connection profile with the exact given name exists.
_con_exists() {
  nmcli -t -f NAME con show 2>/dev/null | grep -Fxq "$1"
}

configure_network() {
  local ssid="$KIOSK_WIFI_SSID" iot="${KIOSK_IOT_SSID:-}"

  log "configuring main WLAN '$ssid' (system-owned, priority 10, powersave off)"
  if _con_exists "$ssid"; then
    nmcli con modify "$ssid" \
      802-11-wireless.ssid "$ssid" \
      802-11-wireless-security.key-mgmt wpa-psk \
      802-11-wireless-security.psk "$KIOSK_WIFI_PSK" \
      802-11-wireless-security.psk-flags 0 \
      connection.autoconnect yes \
      connection.autoconnect-priority 10 \
      802-11-wireless.powersave 2 \
      || die "failed to modify main WLAN profile '$ssid'" 3
  else
    nmcli con add type wifi con-name "$ssid" ifname '*' ssid "$ssid" -- \
      802-11-wireless-security.key-mgmt wpa-psk \
      802-11-wireless-security.psk "$KIOSK_WIFI_PSK" \
      802-11-wireless-security.psk-flags 0 \
      connection.autoconnect yes \
      connection.autoconnect-priority 10 \
      802-11-wireless.powersave 2 \
      || die "failed to add main WLAN profile '$ssid'" 3
  fi
  log "main WLAN '$ssid' configured"

  if [[ -n "$iot" ]] && _con_exists "$iot"; then
    nmcli con modify "$iot" connection.autoconnect no \
      || die "failed to set IoT WLAN '$iot' autoconnect=no" 3
    log "IoT WLAN '$iot' set to never auto-join"
  else
    log "IoT WLAN '${iot:-<none>}' profile not present — nothing to disable"
  fi
}
