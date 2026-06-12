---
schema_version: 1
id: IX-TD-014
repo_key: IX
record_type: tech-debt
number: 14
title: Multi-user, productization, and richer visibility
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
      note: "Retired tracker stub; migrated record body now owns the original entry content. Original legacy ID: TD-014."
      label: Retired pre-planning tracker stub
---
Multi-user, productization, and richer visibility.

## Problem

Add export policy, redaction, permissions, multi-user behavior, or richer visibility states beyond `local-only`.

## Why deferred

V1 is a personal portfolio system. A single `visibility: local-only` field plus repo default prevents accidental publish assumptions without introducing productization scope.

## Revisit trigger

Revisit after a productization decision or a concrete need to publish records externally.
