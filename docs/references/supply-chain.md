# Supply chain policy

The workspace keeps pnpm's `trustPolicy: no-downgrade` enabled. That policy blocks packages whose publish trust evidence is weaker than an earlier release of the same package.

## Effect 4 beta exception

`effect@4.0.0-beta.73` and `@effect/vitest@4.0.0-beta.73` are exact-pinned because the v1 plan chooses Effect 4 beta. On 2026-06-11, pnpm reported both pins as trust downgrades: earlier releases used trusted publisher evidence, while these exact beta releases use provenance attestation.

The repo uses `trustPolicyExclude` for only these exact versions. Do not broaden the exclusion to package level selectors. Revisit the exclusion when upgrading off `4.0.0-beta.73`.

## Native build approval

pnpm 11 enforces reviewed build scripts through `allowBuilds`. `msgpackr-extract` is approved because it is a transitive native helper needed by the current TypeScript toolchain install. Keep build approvals narrow and remove unused approvals when dependency changes make them unnecessary.
