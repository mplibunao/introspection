import { assert, describe, it } from '@effect/vitest';
import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import baseSchema from '../../schemas/base-record.schema.json';
import configSchema from '../../schemas/config.schema.json';
import exportManifestSchema from '../../schemas/export-manifest.schema.json';
import techDebtSchema from '../../schemas/tech-debt-record.schema.json';
import vocabularySchema from '../../schemas/vocabulary.schema.json';

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | Array<JsonValue> | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

const schemaIds = {
  base: baseSchema.$id,
  config: configSchema.$id,
  exportManifest: exportManifestSchema.$id,
  techDebt: techDebtSchema.$id,
  vocabulary: vocabularySchema.$id,
} as const;

const schemas = {
  base: baseSchema,
  config: configSchema,
  exportManifest: exportManifestSchema,
  techDebt: techDebtSchema,
  vocabulary: vocabularySchema,
} as const;

type SchemaKey = keyof typeof schemas;

const allSchemaKeys = [
  'base',
  'config',
  'exportManifest',
  'techDebt',
  'vocabulary',
] as const satisfies ReadonlyArray<SchemaKey>;

const jsonIndent = Number('2');
const schemaVersion = 1;
const recordNumber = Number('7');
const timestamp = '2026-06-10T00:00:00Z';
const checksum = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const formatErrors = (validate: ValidateFunction): string =>
  JSON.stringify(validate.errors ?? [], null, jsonIndent);

const makeAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  for (const key of allSchemaKeys) {
    ajv.addSchema(schemas[key]);
  }

  return ajv;
};

const validatorFor = (key: SchemaKey): ValidateFunction => {
  const validate = makeAjv().getSchema(schemaIds[key]);
  assert.ok(validate, `schema is registered: ${schemaIds[key]}`);

  return validate;
};

const assertValid = (validate: ValidateFunction, fixture: JsonObject): void => {
  assert.strictEqual(validate(fixture), true, formatErrors(validate));
};

const assertInvalid = (validate: ValidateFunction, fixture: JsonObject): void => {
  assert.strictEqual(validate(fixture), false, 'fixture should be rejected');
};

const techDebtFixture = (overrides: JsonObject = {}): JsonObject => ({
  schema_version: schemaVersion,
  id: 'BP-TD-007',
  repo_key: 'BP',
  record_type: 'tech-debt',
  number: recordNumber,
  title: 'Future stack-neutral React preset',
  status: 'open',
  type: 'introspection-record',
  category: 'tech-debt',
  visibility: 'local-only',
  created_at: timestamp,
  updated_at: timestamp,
  tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
  source: {
    discovered_at: timestamp,
    refs: [
      {
        kind: 'tracker',
        ref: 'docs/exec-plans/tech-debt-tracker.md#td-007',
      },
    ],
  },
  ...overrides,
});

const terminalResolution = (disposition: string, withEvidence: boolean): JsonObject => {
  const resolution: JsonObject = {
    disposition,
    resolved_at: timestamp,
    rationale: 'The deferred work has a clear terminal disposition.',
  };

  if (withEvidence) {
    resolution['evidence_refs'] = [
      {
        kind: 'doc',
        ref: 'docs/design-docs/example.md',
      },
    ];
  }

  return resolution;
};

const missingRequiredHeadings = (body: string, requiredHeadings: Array<string>): Array<string> => {
  const headings = new Set(body.match(/^## .+$/gm) ?? []);

  return requiredHeadings.filter((heading) => !headings.has(heading));
};

const requiredTechDebtHeadings = (): Array<string> => {
  const headings: unknown = techDebtSchema['x-required_headings'];
  assert.ok(Array.isArray(headings));
  assert.ok(headings.every((heading) => typeof heading === 'string'));

  return headings;
};

describe('schema self-validation', () => {
  it('validates every schema document against the JSON Schema meta-schema', () => {
    const ajv = makeAjv();

    for (const key of allSchemaKeys) {
      assert.strictEqual(
        ajv.validateSchema(schemas[key]),
        true,
        JSON.stringify(ajv.errors ?? [], null, jsonIndent),
      );
    }
  });
});

describe('record schemas', () => {
  it('validates base and tech-debt frontmatter fixtures', () => {
    const baseValidate = validatorFor('base');
    const techDebtValidate = validatorFor('techDebt');

    assertValid(baseValidate, techDebtFixture());
    assertValid(techDebtValidate, techDebtFixture());
    assertInvalid(techDebtValidate, techDebtFixture({ source: [] }));
    assertInvalid(techDebtValidate, techDebtFixture({ tags: ['Record/Tech-Debt'] }));
  });
});

describe('tech-debt schema boundaries', () => {
  it('rejects IDs and keys outside the tech-debt contract', () => {
    const validate = validatorFor('techDebt');

    assertInvalid(validate, techDebtFixture({ id: 'BP-ABC-007' }));
    assertInvalid(validate, techDebtFixture({ unexpected: 'field' }));
    assertInvalid(validate, techDebtFixture({ created_at: '2026-99-99T99:99:99Z' }));
    assertInvalid(validate, techDebtFixture({ scope: {} }));
  });

  it('validates lifecycle evidence shape without owning status-specific evidence policy', () => {
    const validate = validatorFor('techDebt');

    assertValid(validate, techDebtFixture({ status: 'done' }));
    assertValid(
      validate,
      techDebtFixture({
        status: 'done',
        resolution: terminalResolution('rejected', true),
      }),
    );
    assertInvalid(
      validate,
      techDebtFixture({
        status: 'done',
        resolution: {
          disposition: 'done',
          resolved_at: timestamp,
          rationale: 'The evidence ref is malformed.',
          evidence_refs: [{ kind: 'doc' }],
        },
      }),
    );
  });
});

describe('tech-debt markdown heading contract', () => {
  it('declares the tech-debt markdown body heading contract', () => {
    const validBody = [
      '## Problem',
      'The debt is concrete.',
      '## Why deferred',
      'The current phase has a smaller scope.',
      '## Revisit trigger',
      'Revisit when the owning gate passes.',
    ].join('\n\n');
    const invalidBody = [
      '## Problem',
      'The debt is concrete.',
      '## Why deferred',
      'The current phase has a smaller scope.',
    ].join('\n\n');

    assert.deepStrictEqual(missingRequiredHeadings(validBody, requiredTechDebtHeadings()), []);
    assert.deepStrictEqual(missingRequiredHeadings(invalidBody, requiredTechDebtHeadings()), [
      '## Revisit trigger',
    ]);
  });
});

describe('config schema', () => {
  it('validates decoded config TOML fixtures', () => {
    const validate = validatorFor('config');

    assertValid(validate, {
      schema_version: schemaVersion,
      repo_key: 'BP',
      repo_slug: 'backpressure',
      records: {
        root: 'docs/records',
      },
      defaults: {
        visibility: 'local-only',
      },
      policy_docs: [
        {
          name: 'Tech debt policy',
          path: 'docs/references/tech-debt-policy.md',
          applies_to: ['tech-debt'],
        },
      ],
    });
    assertInvalid(validate, {
      schema_version: schemaVersion,
      repo_key: 'bp',
      repo_slug: 'backpressure',
      records: {
        root: 'docs/records',
      },
      defaults: {
        visibility: 'local-only',
      },
    });
    assertInvalid(validate, {
      schema_version: schemaVersion,
      repo_key: 'BP',
      repo_slug: 'org/backpressure',
      records: {
        root: 'docs/records',
      },
      defaults: {
        visibility: 'local-only',
      },
    });
  });
});

describe('vocabulary schema', () => {
  it('documents tag-level uniqueness as a future validator contract', () => {
    assert.deepStrictEqual(vocabularySchema.properties.terms['x-unique_by'], ['tag']);
  });

  it('validates decoded vocabulary TOML fixtures', () => {
    const validate = validatorFor('vocabulary');

    assertValid(validate, {
      schema_version: schemaVersion,
      terms: [
        {
          tag: 'record/tech-debt',
          status: 'approved',
          description: 'Records for accepted technical debt deferrals.',
          provenance: {
            kind: 'plan',
            ref: 'docs/design-input/introspection-seed-2026-06-01.md',
            noted_at: timestamp,
          },
        },
      ],
    });
  });
});

describe('export manifest schema', () => {
  it('validates generated export manifest fixtures', () => {
    const validate = validatorFor('exportManifest');

    assertValid(validate, {
      schema_version: schemaVersion,
      generated_at: timestamp,
      generator: {
        name: '@mplibunao/introspection',
        version: '0.0.0',
      },
      repo: {
        key: 'BP',
        slug: 'backpressure',
      },
      records_root: 'docs/records',
      exports: [
        {
          kind: 'json',
          path: '.introspection/generated/records.json',
          record_count: schemaVersion,
          sha256: checksum,
        },
      ],
    });
  });
});
