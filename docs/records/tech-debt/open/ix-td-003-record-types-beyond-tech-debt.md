---
schema_version: 1
id: IX-TD-003
repo_key: IX
record_type: tech-debt
number: 3
title: Record types beyond tech-debt
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
---
Record types beyond tech-debt.

## Problem

Mistakes, desires, and learnings ship after the public tech-debt record type.

## Why deferred

V1 proves the record kernel with tech-debt plus a non-user-facing conversion fixture. Adding more public types before the kernel is dogfooded would expand product scope before the substrate is validated.

## Revisit trigger

Revisit after the v1 kernel and tech-debt record type are dogfooded on backpressure.
