---
schema_version: 1
id: IX-TD-018
repo_key: IX
record_type: tech-debt
number: 18
title: Provider ecosystem for a shareable company-brain
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-19T03:40:32Z
updated_at: 2026-06-19T03:40:32Z
tags:
  - record/tech-debt
  - repo/introspection
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-19T03:40:32Z
---
## Problem

introspection is public and shareable, but a consumer cannot add a new source (sentry, jira, slack, github, meetings) without changing the core. To become a company-brain that scales to an unbounded set of sources without bloating the core, it needs a consumer-pluggable provider ecosystem: providers shipped as separate npm packages (first- or third-party), installed a la carte, each paired with its own skill. The decided integration boundary is out-of-process records handoff: a provider runs outside the kernel and hands introspection a replayable batch that import consumes; in-process code is a later, narrow pure-hook layer. Full direction in docs/design-input/provider-ecosystem-direction-2026-06-19.md.

## Why deferred

Not a v1 bootstrap concern; the substrate reshape through IX-SR-11 (manifest types, generic import, identity strategies) is the prerequisite. Standing this up now would also expand introspection past its current facilitate-never-fetch-or-act and local-files-only identity before the record kernel is stable.

## Revisit trigger

Revisit after the reshape stabilizes the kernel and a real second source-consumer materializes. First proof is a mechanical Sentry provider. Settle the provider descriptor, the batch protocol, repo-materialized type manifests, and version compatibility; keep in-process code limited to pure trusted hooks. Reframes IX-TD-013 and must be reconciled with IX-TD-008, IX-TD-011, IX-TD-012, IX-TD-014, and IX-TD-015; add an ADR for the records-first split and the kernel boundary.

## Done when

A consumer can add a source by installing a config-declared provider package without modifying core; the provider runs out-of-process and hands introspection a batch consumed via import; the kernel stays free of source I/O and secrets; and provider type manifests are materialized into the repo so records stay checkable without the provider installed.
