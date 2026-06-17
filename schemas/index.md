# Schemas

This directory holds the declarative validation contracts for introspection source-of-truth formats:

- `base-record.schema.json`: shared record frontmatter fields and reusable evidence shapes.
- `tech-debt-record.schema.json`: tech-debt frontmatter plus the required Markdown body heading contract.
- `config.schema.json`: decoded `.introspection/config.toml` shape.
- `vocabulary.schema.json`: decoded `.introspection/vocabulary.toml` shape.
- `export-manifest.schema.json`: generated export manifest shape.

Runtime validation code enforces cross-field and repository-aware invariants. These schemas define the portable format contracts only.
