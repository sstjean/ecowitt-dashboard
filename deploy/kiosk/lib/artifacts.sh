#!/usr/bin/env bash
# deploy/kiosk/lib/artifacts.sh — sourced by provision.sh.
# install_artifacts: place the launcher, systemd unit, and rollback helper at
# their canonical paths/modes (data-model.md §E3), create the Chrome profile
# dir (0700, kiosk-owned), then reload systemd. Uses common.sh install_file.

install_artifacts() {
  install_file "$SCRIPT_DIR/bin/kiosk-weather"     /usr/local/bin/kiosk-weather      0755 root:root
  install_file "$SCRIPT_DIR/bin/kiosk-rollback"    /usr/local/bin/kiosk-rollback     0755 root:root
  install_file "$SCRIPT_DIR/systemd/kiosk.service" /etc/systemd/system/kiosk.service 0644 root:root

  local profile="/home/${KIOSK_USER}/.config/kiosk-chrome"
  install -d -m 0700 -o "$KIOSK_USER" -g "$KIOSK_USER" "$profile" \
    || die "failed to create Chrome profile dir $profile" 3
  log "ensured Chrome profile dir $profile (0700, owned by $KIOSK_USER)"

  systemctl daemon-reload || die "systemctl daemon-reload failed" 3
}
