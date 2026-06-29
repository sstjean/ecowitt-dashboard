#!/usr/bin/env bash
# deploy/watchdog/run-checks.sh
# CI gate for the watchdog provisioning tree, mirroring deploy/kiosk/run-checks.sh
# and extended with a python3 unittest + coverage gate for the logic-bearing
# helpers (bin/freshness.py, bin/state.py). Invoked by `npm run test:watchdog`.
#
# Tooling (CI installs these): apt-get install -y shellcheck bats python3
#                              python3 -m pip install coverage   (or: apt coverage)
# Locally on macOS:            brew install shellcheck bats-core
#                              python3 -m pip install coverage
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

for tool in shellcheck bats python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: $tool not found (apt-get install $tool / brew install $tool)" >&2
    exit 1
  fi
done

echo "==> shellcheck"
# Entry scripts + sourced libs + the orchestrator (all bash). The .py helpers
# are checked by python below, not shellcheck.
shellcheck -x \
  provision.sh \
  rollback.sh \
  run-checks.sh \
  lib/common.sh lib/config.sh lib/health.sh lib/state.sh lib/actions.sh \
  bin/ecowitt-watchdog-run

echo "==> bats"
bats tests/

echo "==> python unittest + coverage"
if command -v coverage >/dev/null 2>&1; then
  COVERAGE=(coverage)
elif python3 -c 'import coverage' >/dev/null 2>&1; then
  COVERAGE=(python3 -m coverage)
else
  echo "ERROR: coverage.py not found (python3 -m pip install coverage)" >&2
  exit 1
fi

"${COVERAGE[@]}" erase
"${COVERAGE[@]}" run --branch --source=bin -m unittest discover -s tests -p 'test_*.py'
echo "--- coverage report (bin/freshness.py, bin/state.py must be 100%) ---"
"${COVERAGE[@]}" report -m --fail-under=100

echo "==> watchdog checks passed"
