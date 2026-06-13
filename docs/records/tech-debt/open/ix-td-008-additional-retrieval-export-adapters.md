---
schema_version: 1
id: IX-TD-008
repo_key: IX
record_type: tech-debt
number: 8
title: Additional retrieval and export adapters
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
---
Additional retrieval and export adapters.

## Problem

Add concrete retrieval or export adapters beyond the v1 GNO adapter and trivial proving implementations.

## Why deferred

V1 proves the ports are swappable. Additional adapters should wait for a real second consumer, because an adapter written before its consumer exists guesses at interface requirements.

## Revisit trigger

Revisit when a second real retrieval or export consumer exists.
