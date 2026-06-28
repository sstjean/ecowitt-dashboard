#!/usr/bin/env bash
# deploy/kiosk/rollback.sh
# Thin wrapper: ensure the rollback helper is installed, then invoke it to
# revert the device from kiosk mode back to the normal GNOME/gdm desktop
# (FR-020). Re-run provision.sh afterward to restore kiosk mode (FR-021).
# See contracts/rollback.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

[[ "$(id -u)" -eq 0 ]] || die "must run as root (use sudo)" 2

if [[ ! -x /usr/local/bin/kiosk-rollback ]]; then
  install_file "$SCRIPT_DIR/bin/kiosk-rollback" /usr/local/bin/kiosk-rollback 0755 root:root
fi

exec /usr/local/bin/kiosk-rollback
