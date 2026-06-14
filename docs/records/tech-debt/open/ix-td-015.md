---
schema_version: 1
id: IX-TD-015
repo_key: IX
record_type: tech-debt
number: 15
title: Manage exec-plan progress reports as governed records
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-14T05:41:48Z
updated_at: 2026-06-14T05:41:48Z
tags:
  - record/tech-debt
  - repo/introspection
  - status/open
  - visibility/local-only
  - timeframe/roadmap-post-v1
source:
  discovered_at: 2026-06-14T05:41:48Z
  refs:
    - kind: other
      ref: docs/exec-plans/active/reshape-progress-ledger.md
---
## Problem

Exec-plan progress reports, such as the reshape report under `docs/exec-plans/active/`, live as freeform markdown outside the records system. They cannot be queried through gno, and there is no structured way to analyze an orchestration session for gate effectiveness or for how lossy the exec plan was. The opportunity is to bring these reports under introspection so they are gno-queryable and so orchestration sessions become analyzable across runs.

## Why deferred

This sits behind the v1 record kernel and is not a v1 priority. It also carries an unresolved data-model question. The records system was built for atomic entries that decompose cleanly. The old tech-debt tracker followed that shape and became many small per-entry files, each one an independently queryable unit. A progress report instead reads as one cohesive narrative with session-level context like branch state and the remaining work order, and that narrative does not split into small per-entry files the same way. The open question is what the queryable unit should be. Each per-work-unit entry does look atomic, since it already records its own status and gate outcomes alongside the commits and open issues, much like a status-table row. One option treats each entry as a record and renders the narrative as a rollup view, while another registers the whole report as a single document. Resolving that fit is the hard part rather than the CLI plumbing.

## Revisit trigger

Revisit after the v1 record kernel is stable and at least one more orchestration session has produced a report, so there is enough of a corpus to judge whether decomposing reports into queryable per-entry records is worth the cost. The trigger is a concrete need to query across sessions, such as asking which work items skipped a gate or how often a review gate caught a P1.

## Done when

Exec-plan reports become queryable through gno. A cross-session question about gate effectiveness can then be answered from the records instead of by hand. The data-model question above also has a written decision.
