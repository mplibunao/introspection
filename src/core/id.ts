import path from 'node:path';

import type { Finding, ParsedRecord, RecordType } from './record-type-types.js';

interface RecordIdParts {
  readonly repoKey: string;
  readonly typePrefix: string;
  readonly number: number;
}

interface ParsedRecordId extends RecordIdParts {
  readonly id: string;
}

interface RecordPathParts {
  readonly id: string;
  readonly recordTypeKey: string;
  readonly status: string;
}

interface RecordNumberScanOptions {
  readonly repoKey: string;
  readonly recordType: RecordType;
}

interface DuplicateRecordIdGroup {
  readonly id: string;
  readonly records: ReadonlyArray<ParsedRecord>;
}

const idNumberWidth = 3;

const regexSpecialCharacterPattern = /[.*+?^${}()|[\]\\]/gu;

const escapeRegex = (value: string): string => value.replace(regexSpecialCharacterPattern, '\\$&');

const assertPositiveInteger = (number: number): void => {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Record numbers must be positive integers. Received: ${number}.`);
  }
};

const paddedRecordNumber = (number: number): string => {
  assertPositiveInteger(number);

  return String(number).padStart(idNumberWidth, '0');
};

const renderRecordId = ({ repoKey, typePrefix, number }: RecordIdParts): string =>
  `${repoKey}-${typePrefix}-${paddedRecordNumber(number)}`;

const parseRecordId = (id: string, repoKey: string, typePrefix: string): ParsedRecordId | null => {
  const pattern = new RegExp(
    `^(?<repoKey>${escapeRegex(repoKey)})-(?<typePrefix>${escapeRegex(typePrefix)})-(?<number>[0-9]{3,})$`,
    'u',
  );
  const match = pattern.exec(id);
  const numberText = match?.groups?.['number'];

  if (!numberText) {
    return null;
  }

  const number = Number.parseInt(numberText, 10);

  if (!Number.isSafeInteger(number) || number < 1) {
    return null;
  }

  return { id, repoKey, typePrefix, number };
};

const recordFileName = (id: string): string => `${id.toLowerCase()}.md`;

const canonicalRecordRelativePath = ({ id, recordTypeKey, status }: RecordPathParts): string =>
  path.posix.join(recordTypeKey, status, recordFileName(id));

const recordNumberCandidates = (
  record: ParsedRecord,
  options: RecordNumberScanOptions,
): ReadonlyArray<number> => {
  const { frontmatter } = record;

  if (
    frontmatter.repo_key !== options.repoKey ||
    frontmatter.record_type !== options.recordType.key
  ) {
    return [];
  }

  const parsedId = parseRecordId(frontmatter.id, options.repoKey, options.recordType.idPrefix);

  return [frontmatter.number, parsedId?.number]
    .filter((number): number is number => typeof number === 'number')
    .filter((number) => Number.isSafeInteger(number) && number > 0);
};

const maxRecordNumber = (
  records: ReadonlyArray<ParsedRecord>,
  options: RecordNumberScanOptions,
): number =>
  records.reduce((maxNumber, record) => {
    const recordMax = Math.max(0, ...recordNumberCandidates(record, options));

    return Math.max(maxNumber, recordMax);
  }, 0);

const nextRecordNumber = (
  records: ReadonlyArray<ParsedRecord>,
  options: RecordNumberScanOptions,
): number => maxRecordNumber(records, options) + 1;

const duplicateRecordIdGroups = (
  records: ReadonlyArray<ParsedRecord>,
): ReadonlyArray<DuplicateRecordIdGroup> => {
  const recordsById = new Map<string, Array<ParsedRecord>>();

  for (const record of records) {
    const recordsWithId = recordsById.get(record.frontmatter.id) ?? [];
    recordsWithId.push(record);
    recordsById.set(record.frontmatter.id, recordsWithId);
  }

  return [...recordsById.entries()]
    .filter(([, recordsWithId]) => recordsWithId.length > 1)
    .map(([id, recordsWithId]) => ({ id, records: Object.freeze([...recordsWithId]) }));
};

const recordLocation = (record: ParsedRecord): string => {
  if ('relativePath' in record && typeof record.relativePath === 'string') {
    return record.relativePath;
  }

  return record.path ?? record.frontmatter.id;
};
const duplicateRecordIdFindings = (records: ReadonlyArray<ParsedRecord>): ReadonlyArray<Finding> =>
  duplicateRecordIdGroups(records).map((group) => ({
    code: 'id.duplicate',
    severity: 'error',
    message: `Record ID "${group.id}" appears in ${group.records.length} records.`,
    path: ['id', group.id],
    remediation: `Repair one duplicate before validation can pass. Duplicate locations: ${group.records.map(recordLocation).join(', ')}.`,
  }));

export {
  canonicalRecordRelativePath,
  duplicateRecordIdFindings,
  duplicateRecordIdGroups,
  maxRecordNumber,
  nextRecordNumber,
  parseRecordId,
  recordFileName,
  renderRecordId,
};
export type {
  DuplicateRecordIdGroup,
  ParsedRecordId,
  RecordIdParts,
  RecordNumberScanOptions,
  RecordPathParts,
};
