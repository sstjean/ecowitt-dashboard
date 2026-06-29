#!/usr/bin/env bats
# deploy/watchdog/tests/provision_preflight.bats
# T026 (RED-before-GREEN): provision.sh / rollback.sh contracts.
#   preflight: exit 2 not-root, exit 2 missing docker/python3, exit 1 bad knob
#   install:   artifacts land at (overridable) canonical paths; interval is
#              substituted into the timer; re-run is content-stable (idempotent)
#   rollback:  removes units/scripts; keeps config+state unless --purge; no-op
#              when already absent
# id/docker/python3/systemctl/date are PATH-stubbed; install roots are env-overridden.

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"
  ROOT="$(mktemp -d)"
  export WATCHDOG_ENV_FILE=/dev/null

  # Install roots (sandboxed) + skip ownership (we are not really root).
  export WATCHDOG_PREFIX_BIN="$ROOT/usr/local/bin"
  export WATCHDOG_PREFIX_LIB="$ROOT/usr/local/lib/ecowitt-watchdog"
  export WATCHDOG_SYSTEMD_DIR="$ROOT/etc/systemd/system"
  export WATCHDOG_CONFIG_DIR="$ROOT/etc/ecowitt-watchdog"
  export WATCHDOG_STATE_DIR="$ROOT/var/lib/ecowitt-watchdog"
  export WATCHDOG_INSTALL_OWNER="-"
}

teardown() { rm -rf "$STUB" "$ROOT"; }

# _mkstub <name> <body> — drop an executable stub into $STUB.
_mkstub() {
  printf '#!/usr/bin/env bash\n%s\n' "$2" > "$STUB/$1"
  chmod +x "$STUB/$1"
}

# Stubs for preflight-failure cases (stub-only PATH so real docker/python3 are
# hidden). $1 = uid echoed by `id`. Remaining flags pick which tools "exist".
# Essential real tools (bash/dirname/date) are symlinked so the script can run.
_preflight_path() {
  local uid="$1" want_docker="$2" want_py="$3" t
  for t in bash dirname basename date; do
    ln -sf "$(command -v "$t")" "$STUB/$t"
  done
  _mkstub id "[ \"\$1\" = -u ] && echo $uid || echo $uid"
  [ "$want_docker" = yes ] && _mkstub docker 'exit 0'
  [ "$want_py" = yes ] && _mkstub python3 'exit 0'
  _mkstub systemctl 'exit 0'
}

# Full stub set + real tools available (for install/rollback).
_install_path() {
  _mkstub id 'echo 0'
  _mkstub docker 'exit 0'
  _mkstub python3 'exit 0'
  _mkstub systemctl 'exit 0'
  export PATH="$STUB:$PATH"
}

@test "preflight exits 2 when not root" {
  _preflight_path 1000 yes yes
  PATH="$STUB" run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 2 ]
}

@test "preflight exits 2 when docker is missing" {
  _preflight_path 0 no yes
  PATH="$STUB" run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *docker* ]]
}

@test "preflight exits 2 when python3 is missing" {
  _preflight_path 0 yes no
  PATH="$STUB" run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *python3* ]]
}

@test "preflight exits 1 on a malformed numeric knob" {
  _preflight_path 0 yes yes
  PATH="$STUB" WATCHDOG_INTERVAL_SECONDS=foo run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 1 ]
}

@test "provision installs artifacts and substitutes the timer interval" {
  _install_path
  WATCHDOG_INTERVAL_SECONDS=90 run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 0 ]
  [ -x "$WATCHDOG_PREFIX_BIN/ecowitt-watchdog-run" ]
  [ -f "$WATCHDOG_PREFIX_LIB/freshness.py" ]
  [ -f "$WATCHDOG_PREFIX_LIB/state.py" ]
  [ -f "$WATCHDOG_PREFIX_LIB/lib/common.sh" ]
  [ -f "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.service" ]
  [ -f "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer" ]
  [ -f "$WATCHDOG_CONFIG_DIR/watchdog.env" ]
  grep -q "OnUnitActiveSec=90s" "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer"
  ! grep -q "__WATCHDOG_INTERVAL_SECONDS__" "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer"
}

@test "provision is idempotent (second run is content-stable)" {
  _install_path
  bash "$WD_DIR/provision.sh"
  before="$(cksum "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer")"
  run bash "$WD_DIR/provision.sh"
  [ "$status" -eq 0 ]
  after="$(cksum "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer")"
  [ "$before" = "$after" ]
}

@test "provision does not clobber an existing watchdog.env" {
  _install_path
  bash "$WD_DIR/provision.sh"
  printf 'WATCHDOG_INTERVAL_SECONDS=120\n' > "$WATCHDOG_CONFIG_DIR/watchdog.env"
  bash "$WD_DIR/provision.sh"
  grep -q "WATCHDOG_INTERVAL_SECONDS=120" "$WATCHDOG_CONFIG_DIR/watchdog.env"
}

@test "rollback removes units + scripts but keeps config/state" {
  _install_path
  bash "$WD_DIR/provision.sh"
  run bash "$WD_DIR/rollback.sh"
  [ "$status" -eq 0 ]
  [ ! -f "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.service" ]
  [ ! -f "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer" ]
  [ ! -e "$WATCHDOG_PREFIX_BIN/ecowitt-watchdog-run" ]
  [ ! -d "$WATCHDOG_PREFIX_LIB" ]
  [ -f "$WATCHDOG_CONFIG_DIR/watchdog.env" ]
  [ -d "$WATCHDOG_STATE_DIR" ]
}

@test "rollback is a no-op when already absent" {
  _install_path
  run bash "$WD_DIR/rollback.sh"
  [ "$status" -eq 0 ]
}

@test "rollback --purge also removes config + state" {
  _install_path
  bash "$WD_DIR/provision.sh"
  run bash "$WD_DIR/rollback.sh" --purge
  [ "$status" -eq 0 ]
  [ ! -d "$WATCHDOG_CONFIG_DIR" ]
  [ ! -d "$WATCHDOG_STATE_DIR" ]
}
