# Local adoption

Use this guide when another repo adopts the `introspection` CLI before the npm packages are published.

## Runtime requirement

The shipped CLI is Bun-first. The main package installs a thin `introspection` launcher. The launcher tries the matching compiled optional package first, then runs the bundled JS CLI with host Bun.

Install Bun 1.3.11 or newer in adopting repos. Node still matters for this repo's TypeScript and Vitest toolchain, but Node is not the shipped CLI runtime.

## Local-link dogfood path

For WI-14, backpressure should consume this repo from local bits, not npm:

1. Run `corepack pnpm install` in this repo.
2. Run `corepack pnpm build` in this repo.
3. Add the local package to the adopting repo with a local link or `file:` dependency that points at this checkout.
4. Run the adopting repo's `introspection check` command through its normal `pnpm check` flow.

The adopting repo must not keep a second active tracker once records become the source of truth. WI-14 owns that cutover for backpressure.

## Publishing guidance

Publishing is intentionally outside WI-13. When WI-19 publishes `@mplibunao/introspection` and the platform packages, publish all packages through the changesets release flow and npm Trusted Publishing.

Backpressure uses strict dependency cooldowns. A newly published package cannot be consumed there until it passes the configured release-age window, unless WI-19 adds a scoped cooldown exclusion that the package manager supports. Do not bypass that policy with postinstall downloads or ad-hoc global installs.
