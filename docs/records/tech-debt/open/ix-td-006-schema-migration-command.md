---
schema_version: 1
id: IX-TD-006
repo_key: IX
record_type: tech-debt
number: 6
title: Schema migration command
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
Schema migration command.

## Problem

Add `introspection migrate --check` and `introspection migrate --apply` for breaking schema changes.

## Why deferred

Records carry `schema_version` from day one, but migration tooling is not needed until a breaking schema change exists. Building it before the first migration would guess at the real migration shape.

## Revisit trigger

Revisit at the first breaking schema change.
