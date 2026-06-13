---
schema_version: 1
id: IX-TD-010
repo_key: IX
record_type: tech-debt
number: 10
title: Harness hooks beyond the CLI floor
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
Harness hooks beyond the CLI floor.

## Problem

Add Claude and Codex hooks that call the introspection CLI automatically.

## Why deferred

V1 ships the universal manual floor: repo instructions tell agents to run `introspection prime` and use the CLI for transitions. Hooks should stay thin sugar over the CLI and own no policy, state, or retrieval.

## Revisit trigger

Revisit after backpressure dogfood proves the manual flow.
