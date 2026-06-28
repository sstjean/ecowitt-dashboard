# Quickstart: Provision & Verify the Kiosk Runtime

**Feature**: 005-kiosk-runtime

This is the validation/run guide for the kiosk runtime. It reproduces the
acceptance already proven on-device (`kitchen-kiosk` / 192.168.10.156):
cold reboot → cage + Chrome → full 2160×1440 kiosk layout, no keyring dialog,
on the main VLAN, dashboard HTTP 200, clock in `America/New_York`.

Detailed contracts: [contracts/](contracts/). Config entities:
[data-model.md](data-model.md). Pinned decisions: [research.md](research.md).

---

## Prerequisites

- Target device: Surface Pro 3, **Ubuntu 24.04.x LTS, x86_64**, native panel
  2160×1440. (See [plan.md](plan.md) Technical Context.)
- Administrative (sudo) access on the device.
- The dashboard reachable on the main WLAN (default
  `http://192.168.10.5:8090/`).
- A checkout of this repo on the device.
- The main WLAN SSID and PSK (operator-supplied; the PSK is a **secret** —
  never commit it).

## 1. Provide inputs (secret stays off the repo)

```bash
cp deploy/kiosk/.env.example deploy/kiosk/.env
# edit deploy/kiosk/.env:  KIOSK_WIFI_SSID, KIOSK_WIFI_PSK (secret),
# optionally KIOSK_IOT_SSID, KIOSK_URL
```

`deploy/kiosk/.env` is `.gitignore`d. Alternatively pass the vars inline (see
the [provision CLI contract](contracts/provision-cli.md)).

## 2. Provision (the single documented command)

```bash
sudo deploy/kiosk/provision.sh
```

Installs `cage` + `google-chrome-stable` (.deb) + `grim`; creates the `kiosk`
user; installs the launcher, systemd unit, and rollback helper; configures the
system-owned main WLAN profile (priority 10, powersave off) and sets the IoT
SSID to never auto-join; unhooks gdm; enables `kiosk.service`; sets the default
target to `graphical.target`. Idempotent — safe to re-run (FR-004).

## 3. Cold-boot (the real acceptance test)

```bash
sudo reboot
```

With no human present, the device MUST come up straight into the full-screen
dashboard at 2160×1440 — no login, no desktop, no keyring dialog (SC-002).

## 4. Verify on-device

### 4a. Screenshot the frame (`grim` works on cage)

```bash
# as the kiosk user / on the seat:
grim /tmp/wall.png
# inspect /tmp/wall.png — expect:
#  - full 2160x1440 dashboard, large wall layout
#  - NO white keyring "choose password" modal
#  - clock/time values in Eastern (America/New_York)
```

### 4b. Confirm network membership (main VLAN, not IoT)

```bash
nmcli -t -f NAME,DEVICE,STATE connection show --active   # marbles active
ip -4 addr show | grep 192.168.10.                       # main VLAN subnet
nmcli -f connection.autoconnect,connection.autoconnect-priority \
      con show marbles                                   # yes / 10
nmcli -f 802-11-wireless.powersave con show marbles      # 2 (disabled)
nmcli -f connection.autoconnect con show Marbles-iot     # no
```

### 4c. Confirm the dashboard responds

```bash
curl -s -o /dev/null -w '%{http_code}\n' "${KIOSK_URL:-http://192.168.10.5:8090/}"
# expect: 200
```

### 4d. Confirm the service is healthy / self-heals

```bash
systemctl is-enabled kiosk.service   # enabled
systemctl is-active  kiosk.service   # active
# self-heal (browser): kill Chrome → returns within ~2s
pkill -f google-chrome-stable ; sleep 5 ; grim /tmp/wall2.png   # dashboard back
# self-heal (session): systemctl kill kiosk.service → unit restarts (RestartSec=2)
```

## 5. Rollback (and restore)

```bash
sudo deploy/kiosk/rollback.sh   # → disables kiosk.service, re-enables gdm
sudo reboot                     # boots to normal GNOME desktop
# restore kiosk mode:
sudo deploy/kiosk/provision.sh && sudo reboot
```

Break-glass (device won't boot): GRUB → **Advanced options → recovery mode** →
`systemctl disable kiosk.service && systemctl enable gdm` → reboot. See the
[rollback contract](contracts/rollback.md).

---

## Acceptance mapping

| Step | Verifies |
|------|----------|
| 2 | FR-002/003/004 — one-command, documented-input, idempotent provision |
| 3 + 4a | SC-002, FR-007/008/009/010 — unattended cold boot, native res, no keyring |
| 4a (clock) | FR-011 — Eastern timezone |
| 4b | SC-004, FR-015/016/017/018/019 — main VLAN only, never IoT, stable, priority |
| 4c | FR-014 — dashboard reachable |
| 4d | SC-003, FR-012/013 — browser + session self-heal |
| 5 | SC-006, FR-020/021 — rollback + restore |

## Notes

- `greetd`, `seatd`, `wlr-randr` are **not** part of this runtime — do not
  install them (they were exploration-only). See [research.md](research.md).
- Storage UTC / display Eastern is satisfied by the dashboard app; this
  feature only displays it.
