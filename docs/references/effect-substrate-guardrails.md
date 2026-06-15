# Effect substrate guardrails

The substrate reshape rebuilds the CLI on Effect services and Layers. These guardrails keep the rewrite from quietly recreating the patterns the reshape exists to remove. Two failure modes matter most: domain logic that hides global state or untyped side effects, and a service graph that command code can bypass.

This page records the targets. Mechanical enforcement (lint rules and architecture checks) lands in IX-SR-03; until then these are review criteria for every cutover item from IX-SR-02 onward. The architecture rationale lives in the [substrate reshape plan](../exec-plans/active/introspection-substrate-reshape-2026-06-14.md), in the "Service and Layer decomposition" section. This page is the short, durable checklist.

## Targets

| Target | Rule | Why it matters |
| --- | --- | --- |
| Domain code never touches the filesystem | Reads and writes go through the platform filesystem service injected into the store, config, and export layers. No domain module imports `node:fs`. | Filesystem access buried in domain logic cannot be faked in tests or swapped for another platform, and it hides side effects from the type signature. |
| `new Date()` only inside `Clock` | Domain code reads the current time from the Effect `Clock` service. The only literal `new Date()` lives in entrypoint wiring that provides the clock. | A pinned clock is what makes the IX-SR-01 golden fixtures deterministic. A stray `new Date()` reintroduces wall-clock flakiness. |
| Command modules never import core | `src/commands/*`, and the Effect CLI shell that replaces it, reach domain behavior through services on the layer, not through `src/core/*` internals. | The command surface is a thin shell. Importing core directly couples argument parsing to domain internals and lets commands skip the service graph. |
| Domain raises typed errors, never untyped throws | Domain services return `Effect` failures with typed errors from `src/core/errors.ts`. No `throw new Error(...)` in a domain service. | Typed errors are part of the contract: callers handle them exhaustively, and the JSON presenter maps them to stable error codes. An untyped throw escapes that contract. |
| No `process.cwd()` outside repo discovery | Only repo discovery and CLI entrypoint wiring read the process working directory. Everything else receives a resolved repo context. | Ambient working-directory reads make behavior depend on where the process started rather than on the repo the caller named. |
| No arbitrary repo-local code | The manifest engine loads host types as data. introspection never imports or evaluates repo-local JavaScript or TypeScript. | Host repos declare types through manifests. Loading host code would turn a data contract into an unbounded execution surface. |

## How the targets are verified

- Until IX-SR-03, each cutover item is reviewed against this table, and the IX-SR-01 golden fixtures confirm the captured behavior did not drift.
- IX-SR-03 adds the mechanical gate. After it lands, the build fails on any of these:
    - a `node:fs` import inside a domain module
    - a `new Date()` call outside the clock
    - an untyped throw in a domain service
    - a core import from a command module
- Service tests provide test Layers, such as a fake clock and a temp-directory filesystem, instead of global mocks. That approach holds only while the guardrails above hold.
