---
schema_version: 1
id: IX-TD-013
repo_key: IX
record_type: tech-debt
number: 13
title: Dynamic third-party plugin loading
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
Dynamic third-party plugin loading.

## Problem

Support runtime-loaded external record-type plugins.

## Why deferred

V1 uses a static compiled registry. Runtime plugins create versioning, dependency isolation, sandboxing, and API-stability problems that this personal portfolio system does not need yet.

## Revisit trigger

Revisit when truly external or third-party record-type consumers materialize.
