# Prose gate

`pnpm prose` runs Vale with `--no-global` over tracked Markdown files and newly authored non-ignored Markdown files. The gate uses file discovery so new authored docs enter the prose check automatically.

The gate still excludes imported provenance and source documents, such as seed design inputs, pre-bootstrap execution plans, and oracle critique notes. Those documents existed before this Vale policy and currently carry style findings. Keep those exclusions explicit so the repo can add new authored docs without accidentally turning archived provenance into a blocking gate.

Follow-up: when the docs IA stabilizes, run a normalization pass for imported provenance and source documents. That pass should decide whether to rewrite those documents for Vale or keep them archived outside the blocking prose gate.
