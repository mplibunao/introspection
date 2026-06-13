# introspection agent router

This repo is MP's personal CLI substrate for governed markdown records. The v1 plan builds a typed, agent-maintained record system with markdown plus frontmatter as the source of truth.

## Start here

- Exec plans: `docs/exec-plans/`.
- Seed decisions: `docs/design-input/introspection-seed-2026-06-01.md`.
- Tech-debt records: run `introspection prime --type tech-debt`; records live under `docs/records/tech-debt/`.
- Oracle pre-plan critique: `investigations/oracle-preplan-critique-2026-06-01.md`.

## Tooling posture

- Package manager: pnpm 11 via Corepack and `packageManager`.
- Shipped CLI runtime: Bun 1.3.11 or newer. The npm bin prefers a compiled platform binary, then falls back to the bundled JS CLI on host Bun.
- Repo toolchain runtime: Node 24.15.0 or newer remains pinned for TypeScript, Vitest, and local tooling.
- Local front door: vite-plus through `vp check` plus `introspection check` for governed records.
- TypeScript posture: strict config via `@mplibunao/tsconfig`.
- Lint posture: oxlint standards via `@mplibunao/oxlint-standards`, with hard ceilings treated as errors.
- Prose gate: repo-local Vale config, always run with `--no-global`.

## Working rules

- Keep active exec plans under `docs/exec-plans/active/`; move completed plans under `docs/exec-plans/completed/`.
- `AGENTS.md` is a symlink to this file. Update this file, not the symlink.
- At session start for repo work, run `introspection prime` when record context is relevant. Before finishing record or doc changes, run `introspection check`.
- Use a hard cutover when behavior changes. Do not add backwards-compatibility shims unless MP asks.
