#!/usr/bin/env sh
set -eu

scripts/setup-vale.sh

. scripts/lib/vale-bin.sh
VALE="$(resolve_vale)"

"$VALE" --no-global --minAlertLevel=error \
  .changeset/README.md \
  README.md \
  CHANGELOG.md \
  CLAUDE.md \
  docs/index.md \
  docs/decisions/index.md \
  docs/design-docs/index.md \
  docs/design-input/index.md \
  docs/exec-plans/index.md \
  docs/exec-plans/active/index.md \
  docs/exec-plans/completed/index.md \
  docs/investigations/index.md \
  docs/records/index.md \
  docs/references/index.md \
  docs/references/prose-gate.md \
  docs/references/supply-chain.md \
  docs/reports/index.md \
  investigations/index.md \
  schemas/index.md
