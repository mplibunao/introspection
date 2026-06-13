import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import importManifestSchema from '../../schemas/import-manifest.schema.json';
import { IntrospectionError } from '../core/errors.js';
import type { EvidenceRef, JsonSchemaDocument } from '../core/record-type-types.js';

type ImportIdPolicy = 'allocate' | 'preserve';

interface ManifestSection {
  readonly heading: string;
  readonly body: string;
}

interface ManifestResolution {
  readonly rationale: string;
  readonly resolved_at?: string;
  readonly evidence_refs?: ReadonlyArray<EvidenceRef>;
}

interface ImportManifestEntry {
  readonly number?: number;
  readonly legacy_id?: string;
  readonly title: string;
  readonly status: string;
  readonly sections: ReadonlyArray<ManifestSection>;
  readonly resolution?: ManifestResolution;
  readonly source_refs?: ReadonlyArray<EvidenceRef>;
  readonly tags?: ReadonlyArray<string>;
}

interface ImportManifestSource {
  readonly tracker_path?: string;
  readonly discovered_at?: string;
}

interface ImportManifest {
  readonly schema_version: 1;
  readonly record_type: string;
  readonly id_policy: ImportIdPolicy;
  readonly source?: ImportManifestSource;
  readonly entries: ReadonlyArray<ImportManifestEntry>;
}

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateManifest = ajv.compile(importManifestSchema);

const readManifestSource = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new IntrospectionError(
        'import.manifest.not_found',
        'Import manifest file was not found.',
        {
          path: filePath,
        },
      );
    }

    throw error;
  }
};

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const parseManifestJson = (source: string, filePath: string): unknown => {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new IntrospectionError(
      'import.manifest.invalid_json',
      'Import manifest is not valid JSON.',
      {
        path: filePath,
        message: parseErrorMessage(error),
      },
    );
  }
};

const assertManifestShape: (value: unknown, filePath: string) => asserts value is ImportManifest = (
  value,
  filePath,
) => {
  if (!validateManifest(value)) {
    throw new IntrospectionError(
      'import.manifest.schema_violation',
      'Import manifest failed JSON Schema validation.',
      { path: filePath, errors: validateManifest.errors },
    );
  }
};

/*
 * The manifest is the verbatim authoring target an adopter agent writes against, so parse +
 * schema-validate it before any record construction; record-type lifecycle and body-heading
 * rules are enforced later by the corpus-aware preflight, not here.
 */
const loadManifest = async (filePath: string): Promise<ImportManifest> => {
  const source = await readManifestSource(filePath);
  const value = parseManifestJson(source, filePath);
  assertManifestShape(value, filePath);

  return value;
};

const manifestSchema = importManifestSchema as JsonSchemaDocument;

export { loadManifest, manifestSchema };
export type {
  ImportIdPolicy,
  ImportManifest,
  ImportManifestEntry,
  ImportManifestSource,
  ManifestResolution,
  ManifestSection,
};
