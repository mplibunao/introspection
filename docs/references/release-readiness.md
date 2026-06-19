# Release readiness

This note covers the npm release boundary for `@mplibunao/introspection` and the platform packages:

- `@mplibunao/introspection-darwin-arm64`
- `@mplibunao/introspection-linux-arm64`
- `@mplibunao/introspection-linux-x64`

## Steady-state flow

`.github/workflows/release.yml` is the only release workflow. It runs on pushes to `main` and uses `changesets/action@v1` to either open the Version Packages PR or publish packages after MP merges that PR.

Publishing uses npm Trusted Publishing with GitHub OpenID Connect and provenance. Don't add npm token secrets. The workflow must keep `id-token: write`, `actions/setup-node` with `registry-url: https://registry.npmjs.org`, and `NPM_CONFIG_PROVENANCE: 'true'`.

`pnpm release` is fail-closed: it runs `pnpm release:prepare` before `changeset publish`. `release:prepare` runs `pnpm pack:dry-run` and `pnpm pack:smoke`, so the gate blocks publishing unless the tarball contents and packed-install smoke pass.

Before merging the Version Packages PR or enabling trusted publishing, re-verify the `TD-CARD-037` branch-protection ruleset because branch protection plus CI is the publish safety boundary.

## Publishing bindings

MP must configure one npm Trusted Publishing binding per package:

- Provider: GitHub Actions
- Repository: `mplibunao/introspection`
- Workflow file: `.github/workflows/release.yml`
- GitHub Environment: blank/unset

If npm can't create a Trusted Publishing binding until a package exists, follow the canonical procedure in taste-distillery baseline `TD-BASELINE-010` at `baselines/ci-and-release/first-publish-bootstrap.md`. This repo keeps the applied copy below so operators have package-specific commands at the release boundary.

## First-publish bootstrap

Use this bootstrap only if npm requires a package record before MP can configure Trusted Publishing. Steady state is automatic through `.github/workflows/release.yml`.

1. Run `pnpm release:prepare` from the repo root. The fail-closed release gate must pass before publishing any package.
2. Publish each package from its package directory in a visible persistent terminal so MP can complete passkey or browser authentication:

   ```sh
   npm publish --access public --tag latest
   (cd packages/introspection-darwin-arm64 && npm publish --access public --tag latest)
   (cd packages/introspection-linux-arm64 && npm publish --access public --tag latest)
   (cd packages/introspection-linux-x64 && npm publish --access public --tag latest)
   ```

3. Verify every published version with `npm view <package> version dist-tags --json`. `npm access get status <package>` only proves that the package record exists; it doesn't prove that npm published a version.

   ```sh
   npm view @mplibunao/introspection version dist-tags --json
   npm view @mplibunao/introspection-darwin-arm64 version dist-tags --json
   npm view @mplibunao/introspection-linux-arm64 version dist-tags --json
   npm view @mplibunao/introspection-linux-x64 version dist-tags --json
   ```

   When verifying a package that was just published from MP's machine, beware user-level npm safety config such as `before` or `minimumReleaseAge` settings. Those settings can make a newly published package look missing even when npm has published it. For public registry verification, use a clean temporary npm user config:

   ```sh
   NPM_CONFIG_USERCONFIG=$(mktemp) npm view @mplibunao/introspection version dist-tags --json
   NPM_CONFIG_USERCONFIG=$(mktemp) npm view @mplibunao/introspection-darwin-arm64 version dist-tags --json
   NPM_CONFIG_USERCONFIG=$(mktemp) npm view @mplibunao/introspection-linux-arm64 version dist-tags --json
   NPM_CONFIG_USERCONFIG=$(mktemp) npm view @mplibunao/introspection-linux-x64 version dist-tags --json
   ```

   Don't use a clean config for authenticated publish commands because publish commands need MP's npm login state.

4. Create and push the matching package tags in Changesets format:

   ```sh
   git tag "@mplibunao/introspection@<version>"
   git tag "@mplibunao/introspection-darwin-arm64@<version>"
   git tag "@mplibunao/introspection-linux-arm64@<version>"
   git tag "@mplibunao/introspection-linux-x64@<version>"
   git push origin \
     "@mplibunao/introspection@<version>" \
     "@mplibunao/introspection-darwin-arm64@<version>" \
     "@mplibunao/introspection-linux-arm64@<version>" \
     "@mplibunao/introspection-linux-x64@<version>"
   ```

5. Create the matching GitHub release for each tag from `CHANGELOG.md`. The manual bootstrap is complete only when npm and GitHub both show the release.

   ```sh
   gh release create "@mplibunao/introspection@<version>" --title "@mplibunao/introspection@<version>" --notes-file release-notes.md
   gh release create "@mplibunao/introspection-darwin-arm64@<version>" --title "@mplibunao/introspection-darwin-arm64@<version>" --notes-file release-notes.md
   gh release create "@mplibunao/introspection-linux-arm64@<version>" --title "@mplibunao/introspection-linux-arm64@<version>" --notes-file release-notes.md
   gh release create "@mplibunao/introspection-linux-x64@<version>" --title "@mplibunao/introspection-linux-x64@<version>" --notes-file release-notes.md
   ```

6. Configure the npm Trusted Publishing bindings before the next release.

## Consumer repo consumption

Backpressure should stay on the local link until the release explicitly switches it to a published strict-catalog pin. Backpressure's release-age cooldown still applies to the main package and all platform packages.
