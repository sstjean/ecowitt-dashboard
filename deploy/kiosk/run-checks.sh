#!/usr/bin/env bash
# deploy/kiosk/run-checks.sh
# CI gate for the kiosk provisioning tree: shellcheck every shell script and
# run the bats helper suite. Invoked by `npm run test:kiosk` (plan.md Testing).
#
# Tooling (CI installs these):  apt-get install -y shellcheck bats
# Locally on macOS:             brew install shellcheck bats-core
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "ERROR: shellcheck not found (apt-get install shellcheck / brew install shellcheck)" >&2
  exit 1
fi
if ! command -v bats >/dev/null 2>&1; then
  echo "ERROR: bats not found (apt-get install bats / brew install bats-core)" >&2
  exit 1
fi

echo "==> shellcheck"
# Entry scripts + sourced libs + vendored launcher/rollback (all bash).
shellcheck -x \
  provision.sh \
  rollback.sh \
  lib/common.sh lib/packages.sh lib/user.sh lib/artifacts.sh lib/network.sh lib/boot.sh \
  bin/kiosk-weather bin/kiosk-rollback \
  run-checks.sh

echo "==> bats"
bats tests/

echo "==> kiosk checks passed"
