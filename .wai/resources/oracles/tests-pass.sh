#!/usr/bin/env bash
# tests-pass.sh — vitest suite must be green
set -euo pipefail
cd "$(dirname "$0")/../../.."
npx vitest run >/tmp/wai-tests-pass.log 2>&1 || {
  tail -40 /tmp/wai-tests-pass.log >&2
  exit 1
}
