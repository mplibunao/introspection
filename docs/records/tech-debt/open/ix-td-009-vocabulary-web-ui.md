---
schema_version: 1
id: IX-TD-009
repo_key: IX
record_type: tech-debt
number: 9
title: Vocabulary web UI
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
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-009."
      label: Retired pre-planning tracker stub
---
Vocabulary web UI.

## Problem

Provide CRUD and approval flows for controlled vocabulary terms, with CLI deeplinks for batch review.

## Why deferred

V1 keeps vocabulary management in CLI commands. A web UI is extra surface area and should be justified by real batch-review friction, likely after full-corpus tagging exists.

## Revisit trigger

Revisit when batch vocabulary review friction justifies a UI.
