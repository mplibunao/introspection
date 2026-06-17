# Release readiness

This note covers the npm release boundary for `@mplibunao/introspection` and the platform packages:

- `@mplibunao/introspection-darwin-arm64`
- `@mplibunao/introspection-linux-arm64`
- `@mplibunao/introspection-linux-x64`

## Steady-state flow

`.github/workflows/release.yml` is the only release workflow. It runs on pushes to `main` and uses `changesets/action@v1` to either open the Version Packages PR or publish packages after MP merges that PR.

Publishing uses npm Trusted Publishing with GitHub OIDC and provenance. Do not add npm token secrets. The workflow must keep `id-token: write`, `actions/setup-node` with `registry-url: https://registry.npmjs.org`, and `NPM_CONFIG_PROVENANCE: 'true'`.

`pnpm release` is fail-closed: it runs `pnpm release:prepare` before `changeset publish`. `release:prepare` runs `pnpm pack:dry-run` and `pnpm pack:smoke`, so publishing is blocked unless the tarball contents and packed-install smoke pass.

Before merging the Version Packages PR or enabling trusted publishing, re-verify the TD-CARD-037 branch-protection ruleset because branch protection plus CI is the publish safety boundary.

## npm Trusted Publishing bindings

MP must configure one npm Trusted Publishing binding per package:

- Provider: GitHub Actions
- Repository: `mplibunao/introspection`
- Workflow file: `.github/workflows/release.yml`
- GitHub Environment: blank/unset

If npm cannot create a Trusted Publishing binding until a package exists, use a one-time manual first publish only after `pnpm release:prepare` passes. After that bootstrap publish, configure the Trusted Publishing binding before the next release.

## Backpressure consumption

Backpressure should stay on the local link until the release explicitly switches it to a published strict-catalog pin. Backpressure's release-age cooldown still applies to the main package and all platform packages.
