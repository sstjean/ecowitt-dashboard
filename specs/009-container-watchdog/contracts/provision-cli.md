# Contract: `provision.sh` CLI

**Feature**: `009-container-watchdog` | Mirrors `deploy/kiosk/provision.sh`.

Single documented entry point to install the watchdog on `homeautomation`.
Idempotent host-OS provisioning — run as **root**.

```sh
sudo deploy/watchdog/provision.sh
# optional overrides via env or deploy/watchdog/.env (gitignored):
sudo WATCHDOG_INTERVAL_SECONDS=90 deploy/watchdog/provision.sh
```

## Inputs

All inputs are **optional** (every knob has a pinned default — see
[data-model.md](../data-model.md) §2). An optional gitignored
`deploy/watchdog/.env` is sourced if present (`.env.example` is the tracked
template). No secrets are involved.

## Behaviour (FR-001/011/013)

1. **Preflight**: assert root; assert `docker` and `python3` are present.
   Validate any provided numeric knobs are non-negative integers.
2. Install artifacts at their canonical paths via `install_file`
   (data-model.md §6).
3. Write `/etc/ecowitt-watchdog/watchdog.env` **only if absent** (never clobber
   an operator's tuned config on re-run).
4. Ensure state dir `/var/lib/ecowitt-watchdog/` (0755).
5. `systemctl daemon-reload`; `systemctl enable --now ecowitt-watchdog.timer`.
6. **Idempotent**: re-running converges to the same state — content-stable
   installs, no duplicate units, timer already-enabled is a no-op.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (installed or already-current) |
| 1 | usage / invalid input (malformed knob value) |
| 2 | preflight failed (not root, missing `docker`/`python3`) |
| 3 | a provisioning step failed (install/enable) |

## Postconditions

- `systemctl is-enabled ecowitt-watchdog.timer` → `enabled`.
- `systemctl is-active ecowitt-watchdog.timer` → `active`.
- First run appears in the journal within one interval:
  `journalctl -u ecowitt-watchdog.service`.
