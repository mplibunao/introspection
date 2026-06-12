---
schema_version: 1
id: IX-TD-005
repo_key: IX
record_type: tech-debt
number: 5
title: GNO-assisted prime
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
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-005."
      label: Retired pre-planning tracker stub
---
GNO-assisted prime.

## Problem

Add semantic ranking to `introspection prime --query "..."` on top of the deterministic selector.

## Why deferred

V1 prime must stay deterministic and work on a clean machine with no GNO index. GNO can become one ranking signal later, but it must not become a requirement for the default prime path.

## Revisit trigger

Revisit after deterministic prime is proven and the GNO retrieval adapter is stable.
