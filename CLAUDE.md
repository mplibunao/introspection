# introspection agent router

This repo is MP's personal CLI substrate for governed markdown records. The v1 plan builds a typed, agent-maintained record system with markdown plus frontmatter as the source of truth.

## Start here

- Active bootstrap plan: `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md`.
- Seed decisions: `docs/design-input/introspection-seed-2026-06-01.md`.
- Pre-planning deferrals: `docs/exec-plans/tech-debt-tracker.md`.
- Oracle pre-plan critique: `investigations/oracle-preplan-critique-2026-06-01.md`.

## Tooling posture

- Package manager: pnpm 11 via Corepack and `packageManager`.
- Runtime baseline: Node 24.15.0 or newer, pinned for local tooling in `mise.toml`.
- Local front door: vite-plus through `vp check`.
- TypeScript posture: strict config via `@mplibunao/tsconfig`.
- Lint posture: oxlint standards via `@mplibunao/oxlint-standards`, with hard ceilings treated as errors.
- Prose gate: repo-local Vale config, always run with `--no-global`.

## Working rules

- Keep active exec plans under `docs/exec-plans/active/`; move completed plans under `docs/exec-plans/completed/`.
- `AGENTS.md` is a symlink to this file. Update this file, not the symlink.
- WI-01 is scaffold-only. Do not implement schemas, record types, importers, the record engine, or backpressure adoption in this phase.
- Use a hard cutover when behavior changes. Do not add backwards-compatibility shims unless MP asks.
