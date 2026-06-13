/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { createRecordIdentity } from './id.js';
import type { RecordIdentity } from './id.js';
import type {
  BaseRecordFrontmatter,
  ParsedRecord,
  RecordType,
  Resolution,
  SourceBlock,
  ValidationContext,
  Visibility,
} from './record-type-types.js';
import { expectedMachineTags } from './validation.js';

/*
 * The builder may assemble a ParsedRecord from already-decided inputs only.
 * It must NOT parse CLI flags, parse manifests, decide lifecycle evidence,
 * validate candidates, access the corpus, probe paths, or write records.
 * Import from src/commands/*, src/import/manifest.ts, or src/store/* is
 * forbidden so neither consumer's context leaks into shared core logic.
 */

interface BuildRecordCandidateOptions {
  readonly recordType: RecordType;
  readonly repoKey: string;
  readonly number: number;
  readonly status: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly body: string;
  readonly source?: SourceBlock;
  readonly resolution?: Resolution;
  readonly userTags?: ReadonlyArray<string>;
  readonly validationContext: ValidationContext;
}

interface RecordCandidate {
  readonly identity: RecordIdentity;
  readonly record: ParsedRecord;
}

const unique = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

const buildRecordCandidate = ({
  recordType,
  repoKey,
  number,
  status,
  title,
  visibility,
  createdAt,
  updatedAt,
  body,
  source,
  resolution,
  userTags,
  validationContext,
}: BuildRecordCandidateOptions): RecordCandidate => {
  const identity = createRecordIdentity({ repoKey, recordType, number, status });

  // Build base frontmatter with empty tags so expectedMachineTags can read
  // Record state (status, visibility) to derive the machine-owned prefix.
  // Tags are set afterward; field insertion order is load-bearing for YAML rendering.
  const baseFrontmatter: BaseRecordFrontmatter = {
    schema_version: 1,
    id: identity.id,
    repo_key: repoKey,
    record_type: recordType.key,
    number: identity.number,
    title,
    status,
    type: 'introspection-record',
    category: recordType.key,
    visibility,
    created_at: createdAt,
    updated_at: updatedAt ?? createdAt,
    tags: [],
    ...(source && { source }),
    ...(resolution && { resolution }),
  };

  const machineTags = expectedMachineTags(
    recordType,
    { frontmatter: baseFrontmatter, body },
    validationContext,
  );
  const tags = unique([...machineTags, ...(userTags ?? [])]);

  const record: ParsedRecord = {
    frontmatter: { ...baseFrontmatter, tags: [...tags] },
    body,
  };

  return { identity, record };
};

export { buildRecordCandidate };
export type { BuildRecordCandidateOptions, RecordCandidate };
