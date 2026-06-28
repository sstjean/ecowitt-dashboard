# Weather Wall Kiosk Runtime (`deploy/kiosk/`)

Provisions a Surface Pro 3 (or equivalent x86_64 device) into an unattended,
full-screen weather wall: a headless **cage** (wlroots Wayland compositor)
running **Google Chrome** in `--kiosk` mode, started by a **systemd** unit on
boot. One documented command rebuilds the whole runtime from this repo — no
steps live only on the device.

Feature spec: [specs/005-kiosk-runtime/](../../specs/005-kiosk-runtime/) ·
Validation guide: [quickstart.md](../../specs/005-kiosk-runtime/quickstart.md) ·
Contracts: [contracts/](../../specs/005-kiosk-runtime/contracts/).

---

## Target assumptions

- **Device**: Surface Pro 3 (or similar), native panel **2160×1440**.
- **OS**: Ubuntu **24.04.x LTS**, **x86_64**. Provisioning refuses to run on any
  other OS/arch.
- **Network**: the dashboard is reachable on the main trusted WLAN
  (default `http://192.168.10.5:8090/`).
- **Access**: administrative (sudo) on the device, plus a checkout of this repo.

The stack is **cage + google-chrome-stable (.deb) + grim** only.
`greetd`, `seatd`, and `wlr-randr` were exploration-only and are **not**
installed (see [research.md](../../specs/005-kiosk-runtime/research.md)).

---

## Provision (the single documented command)

1. Provide inputs (the WiFi PSK is a **secret** and never committed):

   ```bash
   cp deploy/kiosk/.env.example deploy/kiosk/.env
   # edit deploy/kiosk/.env: KIOSK_WIFI_SSID, KIOSK_WIFI_PSK (secret),
   # optionally KIOSK_IOT_SSID, KIOSK_URL, KIOSK_USER, KIOSK_UID
   ```

   `deploy/kiosk/.env` is `.gitignore`d. You may instead pass the vars inline:

   ```bash
   sudo KIOSK_WIFI_SSID=marbles KIOSK_WIFI_PSK='<psk>' deploy/kiosk/provision.sh
   ```

2. Provision, then cold-boot to verify:

   ```bash
   sudo deploy/kiosk/provision.sh
   sudo reboot
   ```

`provision.sh` is **idempotent** — safe to re-run; it converges to the same
state with no change to a working kiosk (FR-004).

### Inputs

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `KIOSK_WIFI_SSID` | yes | — | Main trusted WLAN to join |
| `KIOSK_WIFI_PSK`  | yes | — | WPA2 PSK for the main WLAN (**secret**) |
| `KIOSK_IOT_SSID`  | no  | `Marbles-iot` | Isolated IoT WLAN to never auto-join |
| `KIOSK_URL`       | no  | `http://192.168.10.5:8090/` | Dashboard URL shown full-screen |
| `KIOSK_USER`      | no  | `kiosk` | Unprivileged session user |
| `KIOSK_UID`       | no  | `1001` | UID for that user |

### What provisioning does (ordered, idempotent)

1. **Preflight** — assert root, Ubuntu 24.04 / x86_64, required inputs present
   (fails fast, never echoes the PSK).
2. **install_packages** — `cage`, `google-chrome-stable` (Google apt repo),
   `grim`.
3. **ensure_user** — create `KIOSK_USER` (uid `KIOSK_UID`) if missing.
4. **install_artifacts** — install the launcher (`/usr/local/bin/kiosk-weather`,
   0755), unit (`/etc/systemd/system/kiosk.service`, 0644), and rollback helper
   (`/usr/local/bin/kiosk-rollback`, 0755); create the Chrome profile dir
   (`/home/<user>/.config/kiosk-chrome`, 0700, kiosk-owned); `daemon-reload`.
5. **configure_network** — system-owned main WLAN profile; IoT profile never
   auto-joins (see [Network](#network-membership)).
6. **wire_boot** — remove the display-manager symlink, enable `kiosk.service`,
   set the default `graphical.target`.
7. **Postflight** — summary + verification pointer.

Exit codes: `0` success · `1` usage/missing input · `2` preflight (root/OS/arch)
· `3` a provisioning step failed.

---

## Self-heal

The wall recovers on its own — no human, no blocking keyring:

- **Browser crash** → the launcher's `while true` loop relaunches Chrome ~2 s
  after it exits (`bin/kiosk-weather`, FR-012).
- **Session failure** → the unit's `Restart=always` / `RestartSec=2` restarts
  the whole cage session (`systemd/kiosk.service`, FR-013).
- **Dashboard unreachable at boot** → Chrome keeps the tab and recovers when the
  dashboard responds (FR-014).
- **No keyring prompt** → the launcher passes `--password-store=basic`, so the
  GNOME keyring "unlock" modal never appears on a cold boot (FR-010).

Behavior is owned by the vendored launcher and unit
([contracts/kiosk-launcher.md](../../specs/005-kiosk-runtime/contracts/kiosk-launcher.md),
[contracts/kiosk-service.md](../../specs/005-kiosk-runtime/contracts/kiosk-service.md));
this README does not re-derive it.

---

## Network membership

Provisioning configures WiFi so the kiosk is reachable on, **and only on**, the
main trusted WLAN, durably across headless reboots
([contracts/network-profile.md](../../specs/005-kiosk-runtime/contracts/network-profile.md)):

- **Main WLAN only** — system-owned profile with the PSK stored at system level
  (`psk-flags 0`), so NetworkManager reconnects with no user logged in
  (FR-015/018).
- **Never IoT** — the `KIOSK_IOT_SSID` profile is set `autoconnect no`, so the
  kiosk never joins the isolated IoT VLAN even in range (FR-016).
- **Stable link** — power-save disabled (`802-11-wireless.powersave 2`) keeps
  the link up under idle (FR-017).
- **Preference** — `autoconnect-priority 10` makes the main WLAN win (FR-019).

The PSK is operator-supplied at provision time and written **only** to the 0600
system-connection file — never committed, never logged.

---

## Rollback & restore

```bash
sudo deploy/kiosk/rollback.sh   # disable kiosk.service, re-enable gdm/gdm3
sudo reboot                     # boots to the normal GNOME desktop
```

Restore kiosk mode by re-provisioning:

```bash
sudo deploy/kiosk/provision.sh && sudo reboot
```

**Break-glass** (device won't boot): GRUB → **Advanced options → recovery
mode** → root shell →

```bash
systemctl disable kiosk.service && systemctl enable gdm   # or gdm3
reboot
```

See [contracts/rollback.md](../../specs/005-kiosk-runtime/contracts/rollback.md).

---

## Verify on-device

After `sudo reboot`, per
[quickstart.md §4](../../specs/005-kiosk-runtime/quickstart.md):

```bash
grim /tmp/wall.png                                  # full 2160×1440, no keyring modal
nmcli -t -f NAME,DEVICE,STATE con show --active     # main WLAN active (not IoT)
nmcli -f 802-11-wireless.powersave con show marbles # 2 (disabled)
curl -s -o /dev/null -w '%{http_code}\n' "${KIOSK_URL:-http://192.168.10.5:8090/}"  # 200
systemctl is-enabled kiosk.service                  # enabled
```

The clock reads Eastern (`America/New_York`) — supplied by the dashboard app;
this runtime only displays it.

---

## Tests & CI gate

Pure-helper logic is covered by `bats`; every script is linted with
`shellcheck`. Run both locally:

```bash
npm run test:kiosk        # shellcheck + bats (deploy/kiosk/run-checks.sh)
```

Tooling: `apt-get install -y shellcheck bats` (CI) or
`brew install shellcheck bats-core` (local). End-to-end acceptance is the
on-device cold-boot test in
[quickstart.md](../../specs/005-kiosk-runtime/quickstart.md) — it cannot run in
CI.

## Layout

```text
deploy/kiosk/
├── provision.sh            # single entry point (idempotent)
├── rollback.sh             # revert to GNOME/gdm
├── run-checks.sh           # shellcheck + bats gate (npm run test:kiosk)
├── .env.example            # placeholder inputs (real .env is gitignored)
├── lib/                    # sourced step modules
│   ├── common.sh           #   log/die, install_file, require_env, PSK redaction
│   ├── packages.sh         #   install_packages (cage, chrome, grim)
│   ├── user.sh             #   ensure_user
│   ├── artifacts.sh        #   install_artifacts (+ Chrome profile dir)
│   ├── network.sh          #   configure_network (nmcli)
│   └── boot.sh             #   wire_boot (unhook gdm, enable unit, set target)
├── bin/
│   ├── kiosk-weather       # vendored launcher (Chrome flags + relaunch loop)
│   └── kiosk-rollback      # vendored rollback helper
├── systemd/
│   └── kiosk.service       # vendored unit (cage → kiosk-weather on tty1)
└── tests/                  # bats helper suite
    ├── provision_preflight.bats
    ├── launcher_selfheal.bats
    └── network_args.bats
```
