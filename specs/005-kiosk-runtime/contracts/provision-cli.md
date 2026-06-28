# Contract: `provision.sh` CLI

The single documented entry point that applies the kiosk runtime to a target
device (FR-002, FR-003, FR-004). Host OS provisioning — must run with root
(via `sudo`).

## Invocation

```bash
# from a checkout of the repo, on the target device:
sudo KIOSK_WIFI_SSID=marbles KIOSK_WIFI_PSK='<psk>' deploy/kiosk/provision.sh
# or:
cp deploy/kiosk/.env.example deploy/kiosk/.env   # fill in, then:
sudo deploy/kiosk/provision.sh                    # sources deploy/kiosk/.env
```

## Inputs (environment)

See [data-model.md](../data-model.md) §E1. Required: `KIOSK_WIFI_SSID`,
`KIOSK_WIFI_PSK`. Optional: `KIOSK_IOT_SSID`, `KIOSK_URL`, `KIOSK_USER`,
`KIOSK_UID`.

## Behavior (ordered, idempotent steps)

1. **Preflight**: assert root; assert Ubuntu 24.04 / x86_64; assert required
   env present (fail fast, never echo the PSK).
2. `install_packages` — `cage`, `google-chrome-stable` (Google apt repo),
   `grim`. (Does NOT install greetd/seatd/wlr-randr.)
3. `ensure_user` — create `KIOSK_USER` (uid `KIOSK_UID`) if missing.
4. `install_artifacts` — install launcher, unit, rollback helper to canonical
   paths/modes (§E3); create the Chrome profile dir; `daemon-reload`.
5. `configure_network` — system-owned main WLAN profile (psk-flags=0,
   priority 10, powersave off); IoT profile autoconnect=no (§E6).
6. `wire_boot` — remove display-manager symlink, enable `kiosk.service`, set
   default `graphical.target` (§E7).
7. **Postflight**: print a short summary + the verification pointer
   (quickstart).

## Idempotency contract

Re-running on an already-provisioned device MUST converge to the same state
(FR-004): user creation skipped if present; files re-copied (content-stable);
nmcli `modify`/`add`-or-update semantics; symlink removal is a no-op if gone.
No step may corrupt a working kiosk on re-run.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success — kiosk provisioned (reboot to verify) |
| 1 | usage / missing required input |
| 2 | preflight failed (not root, wrong OS/arch) |
| 3 | a provisioning step failed (package/network/boot) |

## Security

- MUST NOT print `KIOSK_WIFI_PSK`.
- MUST NOT write the PSK anywhere except the 0600 system-connection file.
- `deploy/kiosk/.env` MUST be `.gitignore`d; only `.env.example` (placeholders)
  is committed.
