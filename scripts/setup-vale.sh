#!/usr/bin/env sh
set -eu

. scripts/lib/vale-bin.sh

VALE="$(resolve_vale)"

mkdir -p styles
current_hash="$(shasum -a 256 .vale.ini | awk '{print $1}')"
hash_file="styles/.vale-sync.sha256"
sync_required=false

for style_dir in styles/Google styles/write-good styles/alex; do
  if [ ! -d "$style_dir" ]; then
    sync_required=true
    break
  fi
done

if [ ! -f "$hash_file" ] || [ "$(cat "$hash_file")" != "$current_hash" ]; then
  sync_required=true
fi

if [ "$sync_required" = true ]; then
  "$VALE" --no-global sync
  printf '%s' "$current_hash" > "$hash_file"
fi
