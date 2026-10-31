#!/usr/bin/env bash
# Publish data/feed.enc.json only when the merged bot plaintext changed.
# Usage: DASHBOARD_PASSCODE='…' ./scripts/sync.sh [/path/to/agents]
set -euo pipefail
export GIT_TERMINAL_PROMPT=0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node "$ROOT/scripts/sync.mjs" "$@"

if [[ -z "$(git status --porcelain -- data/feed.enc.json)" ]]; then
  exit 0
fi

git add -- data/feed.enc.json
git commit -m "Update encrypted assistant feed"
git push
