#!/usr/bin/env sh
set -eu

scripts/setup-vale.sh

. scripts/lib/vale-bin.sh
VALE="$(resolve_vale)"
DISCOVERED_FILES="$(mktemp)"
FILES="$(mktemp)"
trap 'rm -f "$DISCOVERED_FILES" "$FILES"' EXIT

git ls-files -z --cached --others --exclude-standard '*.md' '*.mdx' \
  | xargs -0 sh -c 'for FILE do [ -f "$FILE" ] && printf "%s\0" "$FILE"; done' sh \
  > "$DISCOVERED_FILES"

set +e
grep -zEv '^(AGENTS.md|prompt-exports/.*|docs/design-input/(introspection-seed-2026-06-01|tracker-governance-2026-06-01|tracker-governance-plan-critique-2026-06-01)\.md|docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10\.md|docs/exec-plans/tech-debt-tracker\.md|investigations/oracle-preplan-critique-2026-06-01\.md)$' < "$DISCOVERED_FILES" > "$FILES"
GREP_STATUS="$?"
set -e

if [ "$GREP_STATUS" -gt 1 ]; then
  exit "$GREP_STATUS"
fi

if [ -s "$FILES" ]; then
  xargs -0 "$VALE" --no-global --minAlertLevel=error < "$FILES"
fi
