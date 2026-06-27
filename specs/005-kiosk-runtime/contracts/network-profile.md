# Contract: NetworkManager connection profiles

Provisioning configures WiFi so the kiosk is reachable on, and only on, the
main trusted WLAN, durably across headless reboots (FR-015–FR-019). All values
are applied via `nmcli` against system-owned profiles.

## Main WLAN profile

| `nmcli` property | Value | Requirement |
|------------------|-------|-------------|
| `connection.id` | `KIOSK_WIFI_SSID` (`marbles`) | — |
| `802-11-wireless.ssid` | `KIOSK_WIFI_SSID` | FR-015 |
| `802-11-wireless-security.key-mgmt` | `wpa-psk` | — |
| `802-11-wireless-security.psk` | `KIOSK_WIFI_PSK` (**secret**) | FR-015 |
| `802-11-wireless-security.psk-flags` | `0` (system-stored) | survives headless boot |
| `connection.autoconnect` | `yes` | FR-018 |
| `connection.autoconnect-priority` | `10` | FR-019 |
| `802-11-wireless.powersave` | `2` (disabled) | FR-017 |

Stored at `/etc/NetworkManager/system-connections/<id>.nmconnection` (0600
root). Because it is system-owned with `psk-flags=0`, NetworkManager
reconnects with no user logged in.

## IoT WLAN profile (never auto-join)

| `nmcli` property | Value | Requirement |
|------------------|-------|-------------|
| `connection.id` | `KIOSK_IOT_SSID` (`Marbles-iot`) | — |
| `connection.autoconnect` | `no` | FR-016 |

Applied only if such a profile exists / is known; ensures the kiosk never
auto-joins the isolated IoT VLAN even in range.

## Guarantees

- Headless boot → joins main WLAN via system secret (FR-015).
- Never auto-joins IoT (FR-016).
- Stable link under idle (powersave off, FR-017).
- Reconnects after a drop/reboot on its own (FR-018).
- Prefers main WLAN via priority (FR-019).

## Security

- `KIOSK_WIFI_PSK` is supplied at provision time and written ONLY to the 0600
  system-connection file. It is never committed, never logged.
- Idempotent: `nmcli con modify` (or add-then-modify) converges to these
  values on re-run.
