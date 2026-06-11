import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import baseRecordSchema from '../../schemas/base-record.schema.json';
import { duplicateRecordIdFindings, parseRecordId } from './id.js';
import { validateRecordLifecycle } from './lifecycle.js';
import { tagHasNamespace, tagIsMachineOwned } from './tags.js';
import { vocabularyIntegrityFindings, vocabularyTagFindings } from './vocabulary-validation.js';
import type {
  BaseRecordFrontmatter,
  Finding,
  JsonSchemaDocument,
  ParsedRecord,
  RecordType,
  RecordTypeRegistry,
  ValidationContext,
} from './record-type-types.js';

type CheckFindingSource = 'corpus' | 'record';

interface CheckFinding extends Finding {
  readonly source: CheckFindingSource;
  readonly recordId?: string;
  readonly recordPath?: string;
}

interface CheckReport {
  readonly ok: boolean;
  readonly checkedRecordCount: number;
  readonly failedReadCount: number;
  readonly findings: ReadonlyArray<CheckFinding>;
}

interface RecordReadSuccess {
  readonly ok: true;
  readonly record: ParsedRecord;
}

interface RecordReadFailure {
  readonly ok: false;
  readonly inputPath: string;
  readonly code: string;
  readonly message: string;
  readonly relativePath?: string;
}

type RecordReadResult = RecordReadFailure | RecordReadSuccess;

interface RecordCorpusReader {
  listRecordResults(): Promise<ReadonlyArray<RecordReadResult>>;
}

interface CheckRecordsOptions {
  readonly context: ValidationContext;
  readonly registry: RecordTypeRegistry;
  readonly store: RecordCorpusReader;
}

const supportedSchemaVersion = 1;

const createAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(baseRecordSchema);

  return ajv;
};

const schemaValidators = new WeakMap<JsonSchemaDocument, ValidateFunction>();

const schemaValidator = (schema: JsonSchemaDocument): ValidateFunction => {
  const cachedValidator = schemaValidators.get(schema);

  if (cachedValidator) {
    return cachedValidator;
  }

  const ajv = createAjv();
  const validator = ajv.compile(schema);
  schemaValidators.set(schema, validator);

  return validator;
};

const jsonPointerPath = (instancePath: string): ReadonlyArray<number | string> => {
  if (instancePath.length === 0) {
    return [];
  }

  return instancePath
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
    .map((segment) => {
      const number = Number(segment);

      if (Number.isInteger(number) && String(number) === segment) {
        return number;
      }

      return segment;
    });
};

const recordReportPath = (record: ParsedRecord): string | undefined => {
  if ('relativePath' in record && typeof record.relativePath === 'string') {
    return record.relativePath;
  }

  return record.path;
};

const withRecordContext = (finding: Finding, record: ParsedRecord): CheckFinding => {
  const findingWithContext = {
    ...finding,
    source: 'record' as const,
    recordId: record.frontmatter.id,
  };
  const recordPath = recordReportPath(record);

  if (recordPath) {
    return { ...findingWithContext, recordPath };
  }

  return findingWithContext;
};

const readFailurePath = (failure: RecordReadFailure): string =>
  failure.relativePath ?? failure.inputPath;

const readFailureFinding = (failure: RecordReadFailure): CheckFinding => ({
  code: failure.code,
  severity: 'error',
  message: `Could not read record ${readFailurePath(failure)}: ${failure.message}`,
  remediation:
    "Fix this record's markdown/frontmatter so the checker can parse it, then rerun validation.",
  source: 'corpus',
  recordPath: failure.relativePath ?? failure.inputPath,
});

const unsupportedRecordTypeFinding = (
  record: ParsedRecord,
  registry: RecordTypeRegistry,
): Finding => ({
  code: 'record_type.unsupported',
  severity: 'error',
  message: `Record type "${record.frontmatter.record_type}" is not registered.`,
  path: ['record_type'],
  remediation: `Use a registered record_type (${registry.keys().join(', ')}) or add the type to the static registry in a future work item.`,
});

const unsupportedSchemaVersionFinding = (record: ParsedRecord): Finding | null => {
  if (record.frontmatter.schema_version === supportedSchemaVersion) {
    return null;
  }

  return {
    code: 'schema_version.unsupported',
    severity: 'error',
    message: `Schema version ${record.frontmatter.schema_version} is not supported by this checker.`,
    path: ['schema_version'],
    remediation:
      'Migrate this record to schema_version 1 before continuing. Automated schema migration is intentionally outside WI-06.',
  };
};

const schemaErrorPath = (error: ErrorObject): ReadonlyArray<number | string> => {
  const pathFromInstance = jsonPointerPath(error.instancePath);
  const missingProperty = error.params?.['missingProperty'];

  if (typeof missingProperty === 'string') {
    return [...pathFromInstance, missingProperty];
  }

  return pathFromInstance;
};

const schemaErrorMessage = (error: ErrorObject): string => {
  const location = schemaErrorPath(error).join('.');
  const suffix = error.message ?? 'violates the record schema';

  if (location.length === 0) {
    return `Record frontmatter ${suffix}.`;
  }

  return `Record frontmatter field "${location}" ${suffix}.`;
};

const schemaFindings = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  const validate = schemaValidator(recordType.schema);

  if (validate(record.frontmatter)) {
    return [];
  }

  return (validate.errors ?? []).map((error) => ({
    code: 'schema.violation',
    severity: 'error',
    message: schemaErrorMessage(error),
    path: schemaErrorPath(error),
    remediation:
      'Edit the record frontmatter to match the record-type JSON Schema before rerunning check.',
  }));
};

const missingContextFinding = (field: string, tagExample: string): Finding => ({
  code: `validation.context.${field}.required`,
  severity: 'error',
  message: `Validation context is missing ${field}, so the checker cannot derive ${tagExample}.`,
  path: [field],
  remediation: `Load repo context before validation so ${tagExample} can be enforced instead of silently omitted.`,
});

const contextFindings = (context: ValidationContext): ReadonlyArray<Finding> => {
  const findings: Array<Finding> = [];

  if (!context.repoKey) {
    findings.push(missingContextFinding('repoKey', 'repo_key and ID invariants'));
  }

  if (!context.repoSlug) {
    findings.push(missingContextFinding('repoSlug', 'repo/<slug>'));
  }

  return findings;
};

const repoKeyMismatchFinding = (record: ParsedRecord, repoKey: string): Finding | null => {
  if (record.frontmatter.repo_key === repoKey) {
    return null;
  }

  return {
    code: 'repo_key.mismatch',
    severity: 'error',
    message: `Record repo_key "${record.frontmatter.repo_key}" does not match configured repo key "${repoKey}".`,
    path: ['repo_key'],
    remediation: 'Use the repo_key from .introspection/config.toml so IDs remain repo-scoped.',
  };
};

const idInvariantFindings = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
  context: ValidationContext,
): ReadonlyArray<Finding> => {
  if (!context.repoKey) {
    return [];
  }

  const parsedId = parseRecordId(record.frontmatter.id, context.repoKey, recordType.idPrefix);
  const findings = [repoKeyMismatchFinding(record, context.repoKey)].filter(
    (finding): finding is Finding => finding !== null,
  );

  if (!parsedId) {
    return [
      ...findings,
      {
        code: 'id.invalid_for_record_type',
        severity: 'error',
        message: `Record ID "${record.frontmatter.id}" does not match ${context.repoKey}-${recordType.idPrefix}-NNN.`,
        path: ['id'],
        remediation: `Rename the ID to use repo key ${context.repoKey}, type prefix ${recordType.idPrefix}, and a three-or-more digit positive number.`,
      },
    ];
  }

  if (parsedId.number !== record.frontmatter.number) {
    findings.push({
      code: 'id.number_mismatch',
      severity: 'error',
      message: `Record number ${record.frontmatter.number} does not match ID number ${parsedId.number}.`,
      path: ['number'],
      remediation: 'Align number with the numeric suffix in id before rerunning check.',
    });
  }

  return findings;
};

const canValidateMachineOwnedTag = (tag: string, context: ValidationContext): boolean => {
  if (tagHasNamespace(tag, 'repo')) {
    return typeof context.repoSlug === 'string' && context.repoSlug.length > 0;
  }

  return true;
};

const expectedMachineTags = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
  context: ValidationContext,
): ReadonlyArray<string> => {
  const derivedTags = recordType.derivedTags(record, context);
  const fixedTags = [
    `record/${record.frontmatter.record_type}`,
    `status/${record.frontmatter.status}`,
    `visibility/${record.frontmatter.visibility}`,
  ];

  if (context.repoSlug) {
    fixedTags.push(`repo/${context.repoSlug}`);
  }

  return Object.freeze([...new Set([...derivedTags, ...fixedTags])]);
};

const missingMachineTagFinding = (tag: string): Finding => ({
  code: 'tag.machine_derived.missing',
  severity: 'error',
  message: `Missing machine-derived tag "${tag}".`,
  path: ['tags'],
  remediation: `Add "${tag}" to tags, or use the future check --fix path to rewrite machine-owned tags only.`,
});

const staleMachineTagFinding = (tag: string, expectedTags: ReadonlyArray<string>): Finding => ({
  code: 'tag.machine_derived.stale',
  severity: 'error',
  message: `Machine-owned tag "${tag}" is not valid for this record state.`,
  path: ['tags'],
  remediation: `Replace machine-owned tags with: ${expectedTags.join(', ')}. Preserve non-machine vocabulary tags for WI-08 validation.`,
});

const tagInvariantFindings = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
  context: ValidationContext,
): ReadonlyArray<Finding> => {
  const expectedTags = expectedMachineTags(recordType, record, context);
  const currentTags = new Set(record.frontmatter.tags);
  const missingTags = expectedTags.filter((tag) => !currentTags.has(tag));
  const staleTags = record.frontmatter.tags.filter(
    (tag) =>
      tagIsMachineOwned(tag) &&
      canValidateMachineOwnedTag(tag, context) &&
      !expectedTags.includes(tag),
  );

  return [
    ...missingTags.map(missingMachineTagFinding),
    ...staleTags.map((tag) => staleMachineTagFinding(tag, expectedTags)),
  ];
};

const findingKey = (finding: Finding): string =>
  JSON.stringify([finding.code, finding.path ?? [], finding.message]);

const dedupeFindings = (findings: ReadonlyArray<Finding>): ReadonlyArray<Finding> => {
  const seenKeys = new Set<string>();
  const deduped: Array<Finding> = [];

  for (const finding of findings) {
    const key = findingKey(finding);

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(finding);
    }
  }

  return deduped;
};

const validateParsedRecord = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
  context: ValidationContext,
): ReadonlyArray<CheckFinding> => {
  const contextValidationFindings = contextFindings(context);
  const schemaVersionFinding = unsupportedSchemaVersionFinding(record);

  if (schemaVersionFinding) {
    return [...contextValidationFindings, schemaVersionFinding].map((finding) =>
      withRecordContext(finding, record),
    );
  }

  const findings = dedupeFindings([
    ...contextValidationFindings,
    ...schemaFindings(recordType, record),
    ...idInvariantFindings(recordType, record, context),
    ...validateRecordLifecycle(recordType, record),
    ...recordType.validate(record, context),
    ...tagInvariantFindings(recordType, record, context),
    ...vocabularyTagFindings(record, context),
  ]);

  return findings.map((finding) => withRecordContext(finding, record));
};

const successRecords = (
  results: ReadonlyArray<RecordReadResult>,
): ReadonlyArray<RecordReadSuccess> =>
  results.filter((result): result is RecordReadSuccess => result.ok);

const failedReads = (results: ReadonlyArray<RecordReadResult>): ReadonlyArray<RecordReadFailure> =>
  results.filter((result): result is RecordReadFailure => !result.ok);

const validateSuccessfulRead = (
  result: RecordReadSuccess,
  registry: RecordTypeRegistry,
  context: ValidationContext,
): ReadonlyArray<CheckFinding> => {
  const { record } = result;
  const recordType = registry.get(record.frontmatter.record_type);

  if (!recordType) {
    return [withRecordContext(unsupportedRecordTypeFinding(record, registry), record)];
  }

  return validateParsedRecord(recordType, record, context);
};

const vocabularyContextFindings = (context: ValidationContext): ReadonlyArray<CheckFinding> => {
  if (!context.vocabulary) {
    return [];
  }

  return vocabularyIntegrityFindings(context.vocabulary).map((finding) => ({
    ...finding,
    source: 'corpus' as const,
  }));
};

const checkRecordResults = (
  results: ReadonlyArray<RecordReadResult>,
  registry: RecordTypeRegistry,
  context: ValidationContext,
): CheckReport => {
  const readFailures = failedReads(results);
  const readSuccesses = successRecords(results);
  const findings = [
    ...readFailures.map(readFailureFinding),
    ...readSuccesses.flatMap((result) => validateSuccessfulRead(result, registry, context)),
    ...duplicateRecordIdFindings(readSuccesses.map((result) => result.record)).map((finding) => ({
      ...finding,
      source: 'corpus' as const,
    })),
    ...vocabularyContextFindings(context),
  ];
  const ok = findings.every((finding) => finding.severity !== 'error');

  return {
    ok,
    checkedRecordCount: readSuccesses.length,
    failedReadCount: readFailures.length,
    findings,
  };
};

const checkRecords = async ({
  context,
  registry,
  store,
}: CheckRecordsOptions): Promise<CheckReport> =>
  checkRecordResults(await store.listRecordResults(), registry, context);

const correctedMachineTags = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
  context: ValidationContext,
): ReadonlyArray<string> => {
  const expectedTags = expectedMachineTags(recordType, record, context);
  const contextBlockedMachineTags = record.frontmatter.tags.filter(
    (tag) => tagIsMachineOwned(tag) && !canValidateMachineOwnedTag(tag, context),
  );
  const nonMachineTags = record.frontmatter.tags.filter((tag) => !tagIsMachineOwned(tag));

  return Object.freeze([...expectedTags, ...contextBlockedMachineTags, ...nonMachineTags]);
};

export {
  checkRecordResults,
  checkRecords,
  correctedMachineTags,
  expectedMachineTags,
  tagIsMachineOwned,
};
export type {
  CheckFinding,
  CheckFindingSource,
  CheckRecordsOptions,
  CheckReport,
  RecordCorpusReader,
  RecordReadFailure,
  RecordReadResult,
  RecordReadSuccess,
};
