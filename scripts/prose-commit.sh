#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -ne 1 ]; then
  echo "usage: pnpm prose:commit -- <commit-msg-file>" >&2
  exit 2
fi

scripts/setup-vale.sh

. scripts/lib/vale-bin.sh
VALE="$(resolve_vale)"

tmp="COMMIT_EDITMSG"
trap 'rm -f "$tmp"' EXIT

# Vale ignores extensionless files outside the repo. Copying to this repo-root
# basename makes the [COMMIT_EDITMSG] section deterministic in fresh clones.
cp "$1" "$tmp"
"$VALE" --no-global --minAlertLevel=error "$tmp"
