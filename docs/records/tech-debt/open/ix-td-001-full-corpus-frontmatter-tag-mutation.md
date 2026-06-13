---
schema_version: 1
id: IX-TD-001
repo_key: IX
record_type: tech-debt
number: 1
title: Full-corpus frontmatter tag mutation
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
Full-corpus frontmatter tag mutation.

## Problem

Do not let v1 mutate tags across arbitrary opted-in markdown. v1 owns tags only on introspection record files.

## Why deferred

Full-corpus tag writes need vocabulary operations with referential integrity, anti-churn rules, scoped write boundaries, dry-run previews, and batch review. Without those rails, agents can append near-synonyms faster than they learn the controlled vocabulary.

## Revisit trigger

Revisit after record-local vocabulary operations are proven stable and the read-only full-corpus tag audit ships.
