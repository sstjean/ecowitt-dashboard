#!/usr/bin/env bash
# deploy/kiosk/lib/user.sh — sourced by provision.sh.
# ensure_user: create the unprivileged kiosk user (uid KIOSK_UID, home
# /home/<user>) only if missing. Idempotent no-op when the user exists
# (data-model.md §E2 — no extra groups; logind grants the seat).

ensure_user() {
  local user="$KIOSK_USER" uid="$KIOSK_UID"
  if id -u "$user" >/dev/null 2>&1; then
    log "user '$user' already exists — no change"
    return 0
  fi
  log "creating user '$user' (uid $uid)"
  useradd --create-home --uid "$uid" --shell /bin/bash "$user" \
    || die "failed to create user '$user'" 3
}
