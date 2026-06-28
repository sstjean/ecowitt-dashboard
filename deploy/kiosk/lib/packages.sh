#!/usr/bin/env bash
# deploy/kiosk/lib/packages.sh — sourced by provision.sh.
# install_packages: cage (Wayland compositor) + google-chrome-stable (.deb from
# Google's apt repo) + grim (Wayland screenshot). Idempotent.
# MUST NOT install greetd/seatd/wlr-randr (research.md — exploration-only).

# Configure Google's signed apt repo for google-chrome-stable (idempotent).
_ensure_chrome_repo() {
  local keyring=/usr/share/keyrings/google-chrome.gpg
  local listfile=/etc/apt/sources.list.d/google-chrome.list
  if [[ -f "$keyring" && -f "$listfile" ]]; then
    log "google-chrome apt repo already configured"
    return 0
  fi
  log "configuring google-chrome apt repo"
  apt-get install -y -qq curl ca-certificates gnupg \
    || die "failed to install apt-repo prerequisites" 3
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o "$keyring" \
    || die "failed to fetch Google signing key" 3
  chmod 0644 "$keyring"
  printf 'deb [arch=amd64 signed-by=%s] http://dl.google.com/linux/chrome/deb/ stable main\n' \
    "$keyring" > "$listfile" \
    || die "failed to write google-chrome apt source" 3
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  log "installing packages: cage, grim, google-chrome-stable"
  apt-get update -qq || die "apt-get update failed" 3
  _ensure_chrome_repo
  apt-get update -qq || die "apt-get update (post-repo) failed" 3
  apt-get install -y -qq cage grim google-chrome-stable \
    || die "package installation failed" 3
  log "packages installed (greetd/seatd/wlr-randr intentionally omitted)"
}
