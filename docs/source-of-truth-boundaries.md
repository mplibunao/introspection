# Source-of-truth boundaries

This repo stores records as Markdown with YAML frontmatter. The Markdown file is the source of truth because humans and agents can review it in normal code review, while JSON exports and retrieval indexes stay disposable.

## Canonical repo layout

Each adopting repo uses this layout:

```text
.introspection/
  config.toml
  vocabulary.toml
  .locks/
  generated/
docs/
  records/
    tech-debt/
      open/bp-td-007.md
      archive/bp-td-001.md
```

The committed source-of-truth files are:

- `.introspection/config.toml`: repo mechanics, such as `repo_key`, `repo_slug`, the records root, default visibility, and policy document pointers.
- `.introspection/vocabulary.toml`: the record-local controlled vocabulary, including approved, provisional, and rejected tag terms.
- `docs/records/**`: governed record Markdown. The records root defaults to `docs/records` and can move through `.introspection/config.toml`.
- `schemas/*.schema.json`: declarative validation contracts for records, config, vocabulary, and generated manifests.

The non-source-of-truth paths are:

- `.introspection/.locks/`: local allocator locks. These files are machine state and are not committed.
- `.introspection/generated/`: disposable exports. A later export command must be able to delete and recreate this directory from the committed records.

## Flat frontmatter and nested frontmatter

Base record fields stay flat because GNO parses Markdown frontmatter as flat metadata. The flat surface is the retrieval and filtering contract:

- `id`
- `number`
- `title`
- `repo_key`
- `record_type`
- `type`
- `category`
- `status`
- `visibility`
- `created_at`
- `updated_at`
- `tags`

Tags must use the GNO-compatible grammar declared in `schemas/base-record.schema.json`: lowercase segments separated by `/`, with alphanumeric starts and only letters, digits, dots, or hyphens inside each segment.

Nested fields belong to introspection only. These fields carry typed provenance and lifecycle evidence that GNO does not need to understand:

- `source`: where the record came from.
- `scope`: paths or areas the record touches.
- `resolution`: terminal disposition, date, rationale, and evidence references.
- `conversion_targets`: typed links to the stronger artifact that resolved or superseded the record.

This split keeps retrieval metadata compact while preserving enough structured evidence for lifecycle validation.

## Schema ownership

`schemas/base-record.schema.json` owns the universal frontmatter fields and reusable nested evidence shapes. Record-type schemas extend that base schema and close their own accepted key set.

`schemas/tech-debt-record.schema.json` owns the first public record type's frontmatter shape. It declares the tech-debt lifecycle states, reusable evidence object shape, and required Markdown body-heading metadata. Core lifecycle validation owns status-specific evidence requirements, such as which terminal states require `resolution.evidence_refs`.

- `## Problem`
- `## Why deferred`
- `## Revisit trigger`

`schemas/config.schema.json` and `schemas/vocabulary.schema.json` validate decoded TOML objects. Authors may edit TOML, but validation still uses JSON Schema after parsing. TOML dates and timestamps should be quoted as strings so they validate predictably.

`schemas/export-manifest.schema.json` validates generated export manifests. The manifest documents generated artifacts; it does not become an authority over records.
