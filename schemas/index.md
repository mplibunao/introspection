# Schemas

This directory holds the declarative validation contracts for the WI-02 source-of-truth formats:

- `base-record.schema.json`: shared record frontmatter fields and reusable evidence shapes.
- `tech-debt-record.schema.json`: tech-debt frontmatter plus the required Markdown body heading contract.
- `config.schema.json`: decoded `.introspection/config.toml` shape.
- `vocabulary.schema.json`: decoded `.introspection/vocabulary.toml` shape.
- `export-manifest.schema.json`: generated export manifest shape.

Runtime validation code lands in later work items. These schemas define the format contracts only.
