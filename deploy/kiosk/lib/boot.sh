#!/usr/bin/env bash
# deploy/kiosk/lib/boot.sh — sourced by provision.sh.
# wire_boot: unhook the graphical login manager (cage owns tty1), enable the
# kiosk unit, and make graphical.target the default so a headless cold boot
# lands straight in the kiosk (data-model.md §E7, contracts/kiosk-service.md).
# Idempotent.

wire_boot() {
  local dm=/etc/systemd/system/display-manager.service
  if [[ -L "$dm" || -e "$dm" ]]; then
    rm -f "$dm" || die "failed to remove display-manager symlink" 3
    log "removed display-manager symlink (cage owns tty1)"
  else
    log "display-manager symlink already absent — no change"
  fi

  systemctl enable kiosk.service || die "failed to enable kiosk.service" 3
  systemctl set-default graphical.target || die "failed to set graphical.target" 3
  log "kiosk.service enabled; default target = graphical.target"
}
