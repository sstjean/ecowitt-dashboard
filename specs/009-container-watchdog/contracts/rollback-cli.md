# Contract: `rollback.sh` CLI

**Feature**: `009-container-watchdog` | Mirrors `deploy/kiosk/rollback.sh`.

Cleanly removes the watchdog from the host (FR-012). Run as **root**.

```sh
sudo deploy/watchdog/rollback.sh           # remove units + scripts, keep state/config
sudo deploy/watchdog/rollback.sh --purge   # also remove /etc + /var/lib state
```

## Behaviour

1. Assert root.
2. `systemctl disable --now ecowitt-watchdog.timer` (stop + disable; tolerate
   already-absent).
3. `systemctl stop ecowitt-watchdog.service` if active (tolerate absent).
4. Remove `/etc/systemd/system/ecowitt-watchdog.{service,timer}`;
   `systemctl daemon-reload`.
5. Remove `/usr/local/bin/ecowitt-watchdog-run` and
   `/usr/local/lib/ecowitt-watchdog/` (scripts + libs).
6. **With `--purge` only**: remove `/etc/ecowitt-watchdog/` and
   `/var/lib/ecowitt-watchdog/`.
7. Idempotent — re-running with everything already removed is a clean no-op.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (removed or already-absent) |
| 2 | not root |
| 3 | a removal step failed |

## Postconditions

- `systemctl list-unit-files | grep ecowitt-watchdog` → empty.
- Re-running `provision.sh` afterward fully restores the watchdog.
