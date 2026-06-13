---
schema_version: 1
id: IX-TD-012
repo_key: IX
record_type: tech-debt
number: 12
title: Factory automation beyond the design seam
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
Factory automation beyond the design seam.

## Problem

Add queues, daemons, ticket polling, and ticket-to-agent or ticket-to-plan orchestration around lifecycle transitions.

## Why deferred

V1 only guarantees machine-readable lifecycle transitions through one observable CLI path. Scheduler and runner architecture would become its own product and should not sneak into the record kernel.

## Revisit trigger

Revisit after an explicit promote-when decision following dogfood.
