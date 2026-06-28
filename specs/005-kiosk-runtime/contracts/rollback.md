# Contract: rollback & break-glass recovery

Returns a kiosk device to a normal interactive desktop for debugging/recovery
(FR-020), and documents recovery for a device that won't boot.

## `kiosk-rollback` helper

Canonical target: `/usr/local/bin/kiosk-rollback` (0755 root). Captured
verbatim at `/tmp/kiosk-capture/kiosk-rollback`; vendored at
`deploy/kiosk/bin/kiosk-rollback`.

```bash
#!/usr/bin/env bash
# Revert the wall kiosk back to the GNOME/gdm desktop session.
set -uo pipefail
systemctl disable kiosk.service 2>/dev/null || true
systemctl stop kiosk.service 2>/dev/null || true
systemctl enable gdm 2>/dev/null || systemctl enable gdm3 2>/dev/null || true
systemctl start gdm 2>/dev/null || systemctl start gdm3 2>/dev/null || true
echo "rolled back to gdm/GNOME"
```

## Behavior

1. Disable + stop `kiosk.service` (cage no longer claims tty1).
2. Re-enable + start gdm (re-establishes `display-manager.service`).
3. Reboot → device comes up as a normal interactive desktop.

`deploy/kiosk/rollback.sh` is a thin wrapper that installs (if needed) and
invokes `/usr/local/bin/kiosk-rollback` via sudo.

## Restore kiosk after rollback (FR-021)

Re-run `provision.sh` (idempotent) → device returns to kiosk mode. The
provision step re-removes the display-manager symlink and re-enables
`kiosk.service`.

## Break-glass — device won't boot

Documented in `deploy/kiosk/README.md`:

1. At the GRUB menu choose **Advanced options → recovery mode**.
2. Drop to a root shell with networking.
3. `systemctl disable kiosk.service && systemctl enable gdm` (or restore the
   `display-manager.service` symlink), then reboot.

This is the last-resort path; the normal escape hatch is `kiosk-rollback`.

## Guarantees

- Rollback is a single documented action (FR-020).
- Round-trip (rollback → re-provision) restores kiosk mode (FR-021, SC-006).
- Both paths are documented well enough to follow without prior knowledge of
  the device's hand-built history.
