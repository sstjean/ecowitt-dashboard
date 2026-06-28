# Phase 1 Data Model: Kiosk Runtime Provisioning

**Feature**: 005-kiosk-runtime | **Date**: 2026-06-27

This feature has no database. Its "data model" is the set of **configuration
entities** the provisioning consumes/produces and the **artifact installation
map** (repo source → on-device target). These derive directly from the spec's
Key Entities and the captured runtime.

---

## E1. Provision Inputs (operator-supplied)

The only operator inputs. Supplied via environment variables (or `.env` file
sourced by `provision.sh`); secrets are NEVER committed.

| Field | Required | Default | Source / Validation |
|-------|----------|---------|---------------------|
| `KIOSK_WIFI_SSID` | yes | — (`marbles` on the real device) | Non-empty string. Main trusted WLAN SSID. |
| `KIOSK_WIFI_PSK` | yes | — | **Secret.** 8–63 chars (WPA2 PSK). Never logged, never written to repo; lands only in `/etc/NetworkManager/system-connections/` (0600). |
| `KIOSK_IOT_SSID` | no | `Marbles-iot` | If a profile for this SSID exists, set `autoconnect=no`. |
| `KIOSK_URL` | no | `http://192.168.10.5:8090/` | Dashboard URL the launcher opens. |
| `KIOSK_USER` | no | `kiosk` | Local user the kiosk runs as. |
| `KIOSK_UID` | no | `1001` | uid for the kiosk user if it must be created. |

**Validation rules**: `provision.sh` MUST fail fast with a clear message if a
required field is empty. It MUST NOT echo `KIOSK_WIFI_PSK`.

---

## E2. Kiosk User

| Field | Value | Notes |
|-------|-------|-------|
| name | `KIOSK_USER` (`kiosk`) | created only if missing (idempotent) |
| uid | `KIOSK_UID` (`1001`) | |
| home | `/home/KIOSK_USER` (`/home/kiosk`) | owns the Chrome profile dir |
| shell | default login shell | |
| groups | none beyond the user's default group — logind grants the seat; no `video`/`render`/`seat` membership needed for cage on this device | no sudo |

State: **absent → present**. Re-running on an existing user is a no-op.

---

## E3. Runtime Artifacts (installed files)

The three authoritative files captured at `/tmp/kiosk-capture/` plus their
canonical install targets and modes.

| Artifact | Repo source | Install target | Mode | Owner |
|----------|-------------|----------------|------|-------|
| Launcher | `deploy/kiosk/bin/kiosk-weather` | `/usr/local/bin/kiosk-weather` | 0755 | root |
| systemd unit | `deploy/kiosk/systemd/kiosk.service` | `/etc/systemd/system/kiosk.service` | 0644 | root |
| Rollback helper | `deploy/kiosk/bin/kiosk-rollback` | `/usr/local/bin/kiosk-rollback` | 0755 | root |
| Chrome profile dir | (created) | `/home/kiosk/.config/kiosk-chrome` | 0700 | kiosk |

**Idempotency**: install = copy + chmod + chown; safe to re-apply. After
installing the unit, `systemctl daemon-reload`.

---

## E4. systemd Unit (`kiosk.service`) — key fields

| Field | Value | Requirement |
|-------|-------|-------------|
| `ExecStart` | `/usr/bin/cage -- /usr/local/bin/kiosk-weather` | FR-008 |
| `User` / `Group` | `kiosk` / `kiosk` | runs unprivileged |
| `PAMName` | `login` | logind grants a seat (no display manager) |
| `TTYPath` | `/dev/tty1` | owns the console |
| `Conflicts` | `getty@tty1.service` | no login prompt fighting cage |
| `Environment` | `XDG_SESSION_TYPE=wayland` | Wayland session |
| `Restart` / `RestartSec` | `always` / `2` | self-heal session (FR-013) |
| `WantedBy` | `graphical.target` | enabled into boot (FR-007) |

State: **enabled + active** after provisioning; **disabled + inactive** after
rollback.

---

## E5. Launcher Config (env-driven)

| Field | Default | Effect |
|-------|---------|--------|
| `KIOSK_URL` | `http://192.168.10.5:8090/` | page opened in `--kiosk` |
| `KIOSK_DEBUG` | `0` | `1` adds `--remote-debugging-port=9222 --remote-allow-origins=*` |

Fixed Chrome flag set is **authoritatively** defined in the
[launcher contract](contracts/kiosk-launcher.md); [research.md](research.md)
§D7 explains the rationale. This table does not restate the flags.

---

## E6. NetworkManager Connection Profiles

### Main WLAN profile (the trusted network)

| Property | Value | Requirement |
|----------|-------|-------------|
| `ssid` | `KIOSK_WIFI_SSID` (`marbles`) | FR-015 |
| ownership | **system** (`/etc/NetworkManager/system-connections/`) | survives headless boot |
| `802-11-wireless-security.psk` | `KIOSK_WIFI_PSK` (secret) | FR-015 |
| `psk-flags` | `0` (system-stored) | no per-user keyring |
| `connection.autoconnect` | `yes` | FR-018 |
| `connection.autoconnect-priority` | `10` | prefer this network (FR-019) |
| `802-11-wireless.powersave` | `2` (disabled) | stable link (FR-017) |
| file mode | `0600` root | secret protection |

### IoT WLAN profile (must never auto-join)

| Property | Value | Requirement |
|----------|-------|-------------|
| `ssid` | `KIOSK_IOT_SSID` (`Marbles-iot`) | — |
| `connection.autoconnect` | `no` | FR-016 |

State transitions: provisioning sets main→autoconnect/priority/powersave and
IoT→autoconnect=no. Re-running converges to the same values (idempotent).

---

## E7. Boot Wiring (system state)

| Element | Provisioned state | Rolled-back state |
|---------|-------------------|-------------------|
| `/etc/systemd/system/display-manager.service` symlink | **removed** — NOT masked (cage owns tty1) | re-linked to `gdm3.service` (gdm3 active) |
| `kiosk.service` | enabled (`graphical.target.wants`) | disabled |
| default target | `graphical.target` | `graphical.target` (gdm3) |
| gdm3 | inactive because its display-manager symlink is removed (not masked) | enabled + started |

Break-glass (device won't boot): GRUB recovery mode → disable
`kiosk.service` / re-enable `gdm3`.

---

## Entity → Spec mapping

| Spec Key Entity | Modeled as |
|-----------------|-----------|
| Kiosk device | target platform assumptions (E2 + plan Technical Context) |
| Kiosk runtime | E3 + E4 + E5 + E7 together |
| Main trusted WLAN | E6 main profile |
| Isolated IoT network | E6 IoT profile |
| WiFi secret | `KIOSK_WIFI_PSK` (E1) → system-connection psk (E6) |
| Provisioning command | `provision.sh` consuming E1 |
| Rollback step | `kiosk-rollback` flipping E7 |
