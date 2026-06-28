# Phase 0 Research: Kiosk Runtime Provisioning

**Feature**: 005-kiosk-runtime | **Date**: 2026-06-27

This feature codifies an **already-working, on-device runtime** (validated by
a passing cold-boot reboot test on `kitchen-kiosk` / 192.168.10.156). The
decisions below are therefore not exploratory — they are the *as-shipped*
choices, pinned with the rationale discovered during the live build and the
alternatives that were tried and rejected on the device.

There are **no open `NEEDS CLARIFICATION` items**: the user description plus
the captured artifacts at `/tmp/kiosk-capture/` fully specify the runtime.

---

## D1. Compositor — `cage` (wlroots Wayland kiosk)

- **Decision**: Use `cage` 0.1.5+20240127-2build1 as the single-window
  Wayland kiosk compositor, launched per-boot by systemd on tty1.
- **Rationale**: `cage` is purpose-built to run exactly one application
  full-screen and exit when it exits — the precise kiosk shape. It is a thin
  wlroots compositor, so `grim` screenshots work for verification, and it
  renders the panel at native 2160×1440 without a desktop shell.
- **Alternatives rejected**:
  - **GNOME/mutter (gdm autologin + autostart `.desktop`)** — the previous
    stack. Heavier, pulls a full desktop session, and `grim` does NOT work on
    mutter (no wlroots screencopy), making headless verification harder. This
    is the stack being retired.
  - **greetd + a Wayland session** — `greetd` 0.9.0, `seatd` 0.8.0 were
    installed while exploring a display-manager-driven path, but the final
    unit drives `cage` directly through systemd + logind, so greetd/seatd are
    unnecessary moving parts. **Documented as optional/unused; provisioning
    does NOT install or depend on them.**

## D2. Browser — `google-chrome-stable` **.deb** (NOT snap)

- **Decision**: Install Chrome from **Google's apt repo** (the `.deb`
  package), pinned channel = stable, validated at version
  149.0.7827.200-1.
- **Rationale**: On `cage`, the deb Chrome renders native Wayland at full
  2160×1440 with `dpr=1`. It honors `--ozone-platform=wayland` and the
  kiosk flag set cleanly.
- **Alternatives rejected**:
  - **snap Chromium / snap Chrome** — could NOT drive native Wayland in this
    session and **crash-looped** under cage. The snap confinement/portal path
    fought the wlroots seat. Hard-rejected on the device.
  - **Firefox/Epiphany** — not evaluated; Chrome's `--kiosk` + ozone Wayland
    flags are the proven, minimal path and the dashboard is already validated
    against Chrome.
- **Versioning note**: Google's apt repo serves only the latest stable, so
  "stable channel" is the practical pin granularity. The validated build
  (149.0.7827.200) is recorded for reference. In-browser auto-update is
  suppressed at runtime via `--check-for-update-interval=31536000`; apt
  upgrades remain the controlled update path.

## D3. Init / supervision — systemd unit on tty1 with `PAMName=login`

- **Decision**: A systemd unit `kiosk.service` runs
  `/usr/bin/cage -- /usr/local/bin/kiosk-weather` as user `kiosk` on
  `/dev/tty1`, with `PAMName=login` (so logind grants a seat),
  `Restart=always`, `RestartSec=2`, `Conflicts=getty@tty1.service`,
  `Environment=XDG_SESSION_TYPE=wayland`, `WantedBy=graphical.target`.
- **Rationale**: This is the **minimal logind path** — systemd + logind give
  cage a seat directly, no display manager required. `Restart=always`
  satisfies session-level self-healing (FR-013); `Conflicts=getty@tty1`
  prevents a login prompt fighting cage for the tty. The exact unit is
  captured verbatim at `/tmp/kiosk-capture/kiosk.service`.
- **Alternatives rejected**:
  - **gdm autologin → user session autostart** (old stack) — depends on a
    full display manager + per-user session + keyring, which is exactly what
    caused the white-screen keyring block. Retired.
  - **greetd as the seat manager** — adds a daemon with no benefit over
    logind for a single auto-launched app.

## D4. Self-healing — two layers

- **Decision**: (a) the launcher is a `while true` bash loop that relaunches
  Chrome 2 s after any exit; (b) the systemd unit restarts the whole
  cage session on failure (`Restart=always`, `RestartSec=2`).
- **Rationale**: Layer (a) covers a browser crash without tearing down the
  compositor (fast recovery, FR-012). Layer (b) covers a compositor/session
  death (FR-013). Together they bound recovery to a few seconds, well under
  the SC-003 "under a minute" target.
- **Alternatives rejected**: single-layer (systemd only) — a Chrome crash
  would needlessly restart the whole compositor; the in-loop relaunch is
  cheaper and faster.

## D5. Keyring suppression — Chrome `--password-store=basic`

- **Decision**: Pass `--password-store=basic` to Chrome.
- **Rationale**: **CRITICAL.** Without it, Chrome on a headless boot triggers
  the GNOME-keyring "choose a password" dialog, which blocks the screen with
  a white modal and defeats unattended boot (FR-010). `basic` uses an
  in-profile plaintext store, removing the keyring dependency entirely. This
  was the single most important fix for clean cold boots.
- **Alternatives rejected**: pre-seeding/unlocking gnome-keyring headlessly —
  fragile, reintroduces a keyring daemon dependency the logind path avoids.

## D6. Native resolution & scaling — Wayland ozone + dpr=1

- **Decision**: `--ozone-platform=wayland --force-device-scale-factor=1` (plus
  cage rendering the native mode).
- **Rationale**: Produces full 2160×1440 at `dpr=1`, so the dashboard's
  large-wall layout is used (FR-009). `wlr-randr` 0.3.0 was installed while
  probing modes but is **not needed** by the shipped unit (cage selects the
  native mode); documented optional/unused.
- **Alternatives rejected**: X11/Xorg kiosk — would not give the clean
  native-Wayland path and complicates `grim` verification.

## D7. Launcher flag set (full rationale)

> The [launcher contract](contracts/kiosk-launcher.md) is the **authoritative**
> source for the exact flag set; this table and data-model §E5 are explanatory
> and must reference it rather than diverge.

`/usr/local/bin/kiosk-weather` (captured at `/tmp/kiosk-capture/kiosk-weather`,
mode 0755) runs Chrome with:

| Flag | Why |
|------|-----|
| `--password-store=basic` | suppress GNOME-keyring dialog (D5) — critical |
| `--kiosk` | full-screen, no chrome/UI |
| `--ozone-platform=wayland` | native Wayland render (D6) |
| `--force-device-scale-factor=1` | native 2160×1440, dpr=1 (D6) |
| `--noerrdialogs` `--disable-infobars` | no blocking dialogs/bars |
| `--disable-session-crashed-bubble` | no "restore pages?" after a crash-relaunch |
| `--disable-features=TranslateUI` | no translate popup |
| `--no-first-run` `--fast` `--fast-start` | skip first-run UX, faster boot |
| `--check-for-update-interval=31536000` | suppress in-browser update prompts (D2) |
| `--overscroll-history-navigation=0` | prevent accidental back-nav gestures on a touch panel |
| `--user-data-dir=/home/kiosk/.config/kiosk-chrome` | stable, owned profile dir |

- **Configurability**: `URL` defaults to `http://192.168.10.5:8090/` and is
  overridable via `KIOSK_URL`. `KIOSK_DEBUG=1` adds
  `--remote-debugging-port=9222 --remote-allow-origins=*` for CDP-based
  measurement; off by default.

## D8. Networking — system-owned NetworkManager profile on the main WLAN

- **Decision**: Provisioning configures NetworkManager so the kiosk:
  - connects to the **main** SSID `marbles` (192.168.10.0/24) as a
    **system-owned** connection — the PSK lands in
    `/etc/NetworkManager/system-connections/` with `psk-flags=0`, so it
    reconnects on a headless boot with no user logged in (FR-015, FR-018);
  - sets `connection.autoconnect-priority 10` on `marbles` (FR-019);
  - disables WiFi power-saving (`802-11-wireless.powersave=2`) — the Marvell
    AVASTAR card drops intermittently otherwise (FR-017);
  - sets `connection.autoconnect=no` on the IoT SSID `Marbles-iot` so the
    kiosk **never** auto-joins the isolated VLAN (FR-016).
- **Rationale**: `nmcli`-created connections are system-owned with
  `psk-flags=0` by default, which is exactly the headless-survivable shape.
  Priority + powersave-off + IoT-autoconnect-off make membership correct and
  durable.
- **Secrets**: SSID and PSK are **operator-supplied at provision time** (env
  vars / prompt). The real PSK is **never** hardcoded in the repo; the
  template ships placeholders only (FR-003, constitution Secrets Management).
- **Alternatives rejected**: per-user `nmcli` connection (PSK in the user
  keyring) — would not survive a headless boot; static `wpa_supplicant.conf` —
  bypasses NetworkManager which already manages the device.

## D9. Boot wiring — unhook gdm, own tty1, default `graphical.target`

- **Decision**: Remove the `/etc/systemd/system/display-manager.service`
  symlink (so gdm no longer claims the seat / tty1), enable `kiosk.service`
  into `graphical.target.wants`, and set the default target to
  `graphical.target`.
- **Rationale**: With the display-manager symlink gone and
  `Conflicts=getty@tty1`, cage owns tty1 cleanly at boot (FR-007, FR-008).
- **Rollback / break-glass** (FR-020):
  - `kiosk-rollback` (captured at `/tmp/kiosk-capture/kiosk-rollback`)
    disables+stops `kiosk.service` and re-enables+starts the display manager
    (`gdm3` on Ubuntu 24.04; the helper tries `gdm` then `gdm3`) to recover
    the normal desktop.
  - For a device that won't boot at all, the documented break-glass path is
    **GRUB recovery mode** → re-enable `gdm3` / disable kiosk.service manually.

## D10. Verification tooling — `grim`

- **Decision**: Install `grim` 1.4.0+ds-2build2 for screenshot verification.
- **Rationale**: `grim` uses wlroots screencopy and works on cage; it lets the
  operator (and the quickstart) capture a full-frame 2160×1440 screenshot to
  confirm the layout, the absence of a keyring dialog, and the Eastern clock.
  It does **not** work on GNOME/mutter — another reason the cage stack is
  preferable for an unattended, remotely-verifiable wall display.

---

## Consolidated decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | `cage` wlroots compositor on tty1 | shipped |
| D2 | google-chrome-stable **.deb** (not snap), stable channel | shipped |
| D3 | systemd `kiosk.service`, `PAMName=login`, `Restart=always` | shipped |
| D4 | two-layer self-heal (loop + unit restart) | shipped |
| D5 | `--password-store=basic` keyring suppression | shipped (critical) |
| D6 | Wayland ozone + `--force-device-scale-factor=1`, native 2160×1440 | shipped |
| D7 | full Chrome flag set, `KIOSK_URL`/`KIOSK_DEBUG` overrides | shipped |
| D8 | system-owned `marbles` WLAN, priority 10, powersave off, IoT autoconnect off | shipped |
| D9 | unhook gdm, default `graphical.target`, rollback + GRUB break-glass | shipped |
| D10 | `grim` for verification screenshots | shipped |
| — | greetd / seatd / wlr-randr | **installed-but-unused → NOT provisioned** |
