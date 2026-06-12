---
schema_version: 1
id: IX-TD-002
repo_key: IX
record_type: tech-debt
number: 2
title: Read-only full-corpus tag audit
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
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-002."
      label: Retired pre-planning tracker stub
---
Read-only full-corpus tag audit.

## Problem

Report missing, invalid, or suspect tags across opted-in markdown without mutating any of that markdown.

## Why deferred

The audit should surface corpus tag debt before introspection gets write access beyond its own records, so the team can understand the problem without creating churn.

## Revisit trigger

Revisit after v1 record-local vocabulary mechanics ship.
