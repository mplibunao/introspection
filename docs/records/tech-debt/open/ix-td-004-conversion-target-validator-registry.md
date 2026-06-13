---
schema_version: 1
id: IX-TD-004
repo_key: IX
record_type: tech-debt
number: 4
title: Conversion-target validator registry
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
Conversion-target validator registry.

## Problem

Add mechanical per-kind validation that a conversion target became a real artifact, such as an existing doc path, passing check script, valid skill, taste-distillery card, or linting instruction path.

## Why deferred

V1 only enforces generic evidence shape. Sufficiency rules are record-type judgment, and mistakes or learnings need real conversion validation before this registry is worth designing.

## Revisit trigger

Revisit after mistakes and learnings record types land.
