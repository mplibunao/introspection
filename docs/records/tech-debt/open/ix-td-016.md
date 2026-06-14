---
schema_version: 1
id: IX-TD-016
repo_key: IX
record_type: tech-debt
number: 16
title: record create has no flag for vocabulary tags
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-14T05:54:28Z
updated_at: 2026-06-14T05:54:28Z
tags:
  - record/tech-debt
  - repo/introspection
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-14T05:54:28Z
  refs:
    - kind: other
      ref: src/commands/record.ts
---
## Problem

`record create` exposes no `--tag` flag, so a record cannot carry a non-default vocabulary tag at creation. The only governed ways to set one are an `import` manifest, which is heavy for a single record, or hand-editing frontmatter, which bypasses the CLI guardrails. This came up while filing IX-TD-015, where the `timeframe/roadmap-post-v1` tag had to be added by hand.

## Why deferred

It is not blocking. Hand-editing plus `introspection check` validates the result, and the import manifest path exists for bulk cases. The fix is a small additive flag, but it should land with vocabulary validation so a typo'd or unapproved tag fails at creation rather than at check time.

## Revisit trigger

Revisit when a second record needs a non-default tag at creation, or when hand-editing record frontmatter shows up as a recurring authoring step.

## Done when

`record create` accepts repeatable `--tag` values, each one validated against the approved vocabulary for the record type. A record can then be created with its full tag set in one command, and an unapproved tag is rejected at creation.
