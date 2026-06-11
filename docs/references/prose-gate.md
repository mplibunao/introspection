# Prose gate

`pnpm prose` runs Vale with `--no-global` over the WI-01 scaffold docs, reference docs, Changesets README, and directory indexes. The gate excludes imported provenance and source documents, such as seed design inputs and pre-bootstrap execution plans, because those documents existed before this Vale policy and currently carry style findings.

Follow-up: when the docs IA stabilizes, run a normalization pass for imported provenance and source documents. That pass should decide whether to rewrite those documents for Vale or keep them archived outside the blocking prose gate.
