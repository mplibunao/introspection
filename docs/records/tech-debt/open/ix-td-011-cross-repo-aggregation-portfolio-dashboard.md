---
schema_version: 1
id: IX-TD-011
repo_key: IX
record_type: tech-debt
number: 11
title: Cross-repo aggregation and portfolio dashboard
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
  - timeframe/roadmap-post-v1
source:
  discovered_at: "2026-06-01T00:00:00Z"
  refs:
    - kind: tracker
      ref: docs/exec-plans/tech-debt-tracker.md
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-011."
      label: Retired pre-planning tracker stub
---
Cross-repo aggregation and portfolio dashboard.

## Problem

Add cross-repo rollups and portfolio dashboards across adopted repos.

## Why deferred

V1 is repo-local. Aggregation is not worth the surface area until enough repos have adopted introspection and produce comparable records.

## Revisit trigger

Revisit when three or more repos adopt introspection.
