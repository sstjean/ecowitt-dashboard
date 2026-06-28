#!/usr/bin/env bash
# deploy/kiosk/provision.sh
# Single documented entry point to apply the weather-wall kiosk runtime to a
# target device (FR-002/003/004). Idempotent host-OS provisioning — run as root.
#
#   sudo KIOSK_WIFI_SSID=marbles KIOSK_WIFI_PSK='<psk>' deploy/kiosk/provision.sh
#   # or fill deploy/kiosk/.env (gitignored) then:  sudo deploy/kiosk/provision.sh
#
# Exit codes: 0 success | 1 usage/missing input | 2 preflight (root/OS/arch)
#             | 3 a provisioning step failed.   See contracts/provision-cli.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/packages.sh
source "$SCRIPT_DIR/lib/packages.sh"
# shellcheck source=lib/user.sh
source "$SCRIPT_DIR/lib/user.sh"
# shellcheck source=lib/artifacts.sh
source "$SCRIPT_DIR/lib/artifacts.sh"
# shellcheck source=lib/network.sh
source "$SCRIPT_DIR/lib/network.sh"
# shellcheck source=lib/boot.sh
source "$SCRIPT_DIR/lib/boot.sh"

# --- Preflight --------------------------------------------------------------
assert_root() {
  [[ "$(id -u)" -eq 0 ]] || die "must run as root (use sudo)" 2
}

assert_os() {
  local arch; arch="$(uname -m)"
  [[ "$arch" == "x86_64" ]] || die "unsupported arch: $arch (need x86_64)" 2
  local os_release="${KIOSK_OS_RELEASE:-/etc/os-release}"
  [[ -r "$os_release" ]] || die "cannot read os-release at $os_release" 2
  # shellcheck disable=SC1090
  . "$os_release"
  [[ "${VERSION_ID:-}" == "24.04" ]] \
    || die "unsupported OS: ${PRETTY_NAME:-unknown} (need Ubuntu 24.04)" 2
}

preflight() {
  assert_root
  assert_os
  # WiFi inputs are required (US3); IoT SSID is optional.
  require_env KIOSK_WIFI_SSID KIOSK_WIFI_PSK
  log "preflight ok: root, Ubuntu 24.04 ${arch:-x86_64}, required inputs present"
}

postflight() {
  log "kiosk runtime provisioned for user '${KIOSK_USER}' → ${KIOSK_URL}"
  log "reboot to verify:  sudo reboot"
  log "verification steps: specs/005-kiosk-runtime/quickstart.md §4 (grim, nmcli, curl)"
}

# --- Orchestration ----------------------------------------------------------
main() {
  # Operator inputs / secret (optional file; inline env also supported).
  local env_file="${KIOSK_ENV_FILE:-$SCRIPT_DIR/.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  # Defaults for optional inputs (data-model.md §E1).
  default_env KIOSK_IOT_SSID "Marbles-iot"
  default_env KIOSK_URL      "http://192.168.10.5:8090/"
  default_env KIOSK_USER     "kiosk"
  default_env KIOSK_UID      "1001"

  preflight
  install_packages
  ensure_user
  install_artifacts
  configure_network
  wire_boot
  postflight
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
