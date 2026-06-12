---
schema_version: 1
id: IX-TD-007
repo_key: IX
record_type: tech-debt
number: 7
title: Global-instruction rewrite
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: "2026-06-01T00:00:00Z"
updated_at: "2026-06-12T00:00:00Z"
tags:
  - record/tech-debt
  - repo/introspection
  - status/open
  - visibility/local-only
  - timeframe/deferred-behind-v1
source:
  discovered_at: "2026-06-01T00:00:00Z"
  refs:
    - kind: tracker
      ref: docs/exec-plans/tech-debt-tracker.md
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-007."
      label: Retired pre-planning tracker stub
---
Global-instruction rewrite.

## Problem

Replace the reflexive tracker-first persistence rule in claude-toolkit global instructions with a rule that follows the repo tracking system when one exists.

## Why deferred

The replacement should preserve the invariant that accepted unresolved gaps get persisted, while excluding brainstorms, rejected ideas, same-session tasks, and owner-doc duplicates. It intentionally waits until dogfood proves the introspection path.

## Revisit trigger

Revisit when the backpressure dogfood gate passes. WI-18 owns that rewrite; WI-17 only migrates this record.
