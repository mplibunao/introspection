import { IntrospectionError } from './errors.js';
import type {
  ParsedRecord,
  PrimeSummary,
  RecordTypeRegistry,
  ValidationContext,
} from './record-type-types.js';

interface PrimeCandidateRecord {
  readonly record: ParsedRecord;
  readonly relativePath: string;
}

interface PrimeLimitDefaults {
  readonly defaultLimit?: number;
  readonly hardLimit?: number;
}

interface PrimeFilters {
  readonly types?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly paths?: ReadonlyArray<string>;
  readonly includeTerminal?: boolean;
  readonly all?: boolean;
}

interface SelectPrimeOptions {
  readonly records: ReadonlyArray<PrimeCandidateRecord>;
  readonly registry: RecordTypeRegistry;
  readonly context: ValidationContext;
  readonly now: Date;
  readonly requestedLimit?: number;
  readonly limits?: PrimeLimitDefaults;
  readonly filters?: PrimeFilters;
  readonly failedReadCount?: number;
}

interface PrimeLimitReport {
  readonly defaultLimit: number;
  readonly hardLimit: number;
  readonly requestedLimit?: number;
  readonly effectiveLimit: number;
  readonly clamped: boolean;
}

interface PrimeSelectedRecord extends PrimeSummary {
  readonly path: string;
  readonly number: number;
  readonly ageDays: number;
}

interface PrimeSelection {
  readonly generatedAt: string;
  readonly filters: Required<PrimeFilters>;
  readonly limit: PrimeLimitReport;
  readonly scannedRecordCount: number;
  readonly failedReadCount: number;
  readonly totalMatchingRecordCount: number;
  readonly shownRecordCount: number;
  readonly omittedRecordCount: number;
  readonly records: ReadonlyArray<PrimeSelectedRecord>;
}

const builtInDefaultLimit = 10;
const builtInHardLimit = 50;
const millisecondsPerDay = 86_400_000;
const leftBeforeRight = -1;

const uniqueSorted = (values: ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  Object.freeze([...new Set(values ?? [])].sort((left, right) => left.localeCompare(right)));

const normalizedFilters = (filters: PrimeFilters = {}): Required<PrimeFilters> => ({
  types: uniqueSorted(filters.types),
  statuses: uniqueSorted(filters.statuses),
  tags: uniqueSorted(filters.tags),
  paths: uniqueSorted(filters.paths),
  includeTerminal: filters.includeTerminal === true,
  all: filters.all === true,
});

const parseTimestamp = (value: string): number | null => {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

const timestampIsValid = (value: number | null): value is number => value !== null;

const ageDays = (now: Date, updatedAt: string): number => {
  const updatedAtTimestamp = parseTimestamp(updatedAt);

  if (!timestampIsValid(updatedAtTimestamp)) {
    return 0;
  }

  const age = now.getTime() - updatedAtTimestamp;

  return Math.max(0, Math.floor(age / millisecondsPerDay));
};

const normalizePath = (value: string): string => value.replaceAll('\\', '/').replace(/^\.\//u, '');

const pathMatches = (relativePath: string, filters: ReadonlyArray<string>): boolean => {
  if (filters.length === 0) {
    return true;
  }

  const normalizedPath = normalizePath(relativePath);

  return filters.some((filter) => {
    const normalizedFilter = normalizePath(filter).replace(/\/$/u, '');

    return (
      normalizedPath === normalizedFilter ||
      normalizedPath.startsWith(`${normalizedFilter}/`) ||
      normalizedPath.includes(normalizedFilter)
    );
  });
};

const hasAllTags = (recordTags: ReadonlyArray<string>, filters: ReadonlyArray<string>): boolean => {
  if (filters.length === 0) {
    return true;
  }

  const tags = new Set(recordTags);

  return filters.every((tag) => tags.has(tag));
};

const statusKind = (
  candidate: PrimeCandidateRecord,
  registry: RecordTypeRegistry,
): 'active' | 'terminal' | 'unknown' => {
  const recordType = registry.get(candidate.record.frontmatter.record_type);
  const status = recordType?.lifecycle.statuses[candidate.record.frontmatter.status];

  return status?.kind ?? 'unknown';
};

const terminalRecordsAllowed = (filters: Required<PrimeFilters>): boolean =>
  filters.includeTerminal || filters.all || filters.statuses.length > 0;

const matchesCurrentRepo = (
  candidate: PrimeCandidateRecord,
  context: ValidationContext,
): boolean => {
  if (!context.repoKey) {
    return true;
  }

  return candidate.record.frontmatter.repo_key === context.repoKey;
};

const candidateMatches = (
  candidate: PrimeCandidateRecord,
  registry: RecordTypeRegistry,
  context: ValidationContext,
  filters: Required<PrimeFilters>,
): boolean => {
  const { frontmatter } = candidate.record;

  if (!matchesCurrentRepo(candidate, context)) {
    return false;
  }

  if (filters.types.length > 0 && !filters.types.includes(frontmatter.record_type)) {
    return false;
  }

  if (filters.statuses.length > 0 && !filters.statuses.includes(frontmatter.status)) {
    return false;
  }

  if (!terminalRecordsAllowed(filters) && statusKind(candidate, registry) !== 'active') {
    return false;
  }

  return (
    hasAllTags(frontmatter.tags, filters.tags) && pathMatches(candidate.relativePath, filters.paths)
  );
};

type PrimeRecordComparator = (left: PrimeSelectedRecord, right: PrimeSelectedRecord) => number;

const compareUpdatedAt: PrimeRecordComparator = (left, right) => {
  const leftUpdatedAt = parseTimestamp(left.updatedAt);
  const rightUpdatedAt = parseTimestamp(right.updatedAt);

  if (timestampIsValid(leftUpdatedAt) && timestampIsValid(rightUpdatedAt)) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  if (timestampIsValid(leftUpdatedAt)) {
    return leftBeforeRight;
  }

  if (timestampIsValid(rightUpdatedAt)) {
    return 1;
  }

  return 0;
};

const compareRecordType: PrimeRecordComparator = (left, right) =>
  left.recordType.localeCompare(right.recordType);

const compareNumber: PrimeRecordComparator = (left, right) => left.number - right.number;

const compareId: PrimeRecordComparator = (left, right) => left.id.localeCompare(right.id);

const comparePath: PrimeRecordComparator = (left, right) => left.path.localeCompare(right.path);

const firstNonZero = (values: ReadonlyArray<number>): number =>
  values.find((value) => value !== 0) ?? 0;

const compareSelectedRecords = (left: PrimeSelectedRecord, right: PrimeSelectedRecord): number =>
  firstNonZero([
    compareUpdatedAt(left, right),
    compareRecordType(left, right),
    compareNumber(left, right),
    compareId(left, right),
    comparePath(left, right),
  ]);

const toSelectedRecord = (
  candidate: PrimeCandidateRecord,
  registry: RecordTypeRegistry,
  context: ValidationContext,
  now: Date,
): PrimeSelectedRecord => {
  const summary = registry
    .require(candidate.record.frontmatter.record_type)
    .summarizeForPrime(candidate.record, context);

  return {
    ...summary,
    path: candidate.relativePath,
    number: candidate.record.frontmatter.number,
    ageDays: ageDays(now, summary.updatedAt),
  };
};

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new IntrospectionError('prime.limit.invalid', `${label} must be a positive integer.`, {
      label,
      value,
    });
  }
};

const assertLimitOrder = (defaultLimit: number, hardLimit: number): void => {
  if (hardLimit < defaultLimit) {
    throw new IntrospectionError(
      'prime.limit.config_invalid',
      'prime.hard_limit must be greater than or equal to prime.default_limit.',
      { defaultLimit, hardLimit },
    );
  }
};

const validateConfiguredLimits = (defaultLimit: number, hardLimit: number): void => {
  assertPositiveInteger(defaultLimit, 'prime.default_limit');
  assertPositiveInteger(hardLimit, 'prime.hard_limit');
  assertLimitOrder(defaultLimit, hardLimit);
};

const limitReport = (
  defaultLimit: number,
  hardLimit: number,
  requestedLimit: number | undefined,
): PrimeLimitReport => {
  const desiredLimit = requestedLimit ?? defaultLimit;
  const baseReport = {
    defaultLimit,
    hardLimit,
    effectiveLimit: Math.min(desiredLimit, hardLimit),
    clamped: desiredLimit > hardLimit,
  };

  if (typeof requestedLimit === 'number') {
    return { ...baseReport, requestedLimit };
  }

  return baseReport;
};

const resolveLimits = (
  requestedLimit: number | undefined,
  defaults: PrimeLimitDefaults = {},
): PrimeLimitReport => {
  const defaultLimit = defaults.defaultLimit ?? builtInDefaultLimit;
  const hardLimit = defaults.hardLimit ?? builtInHardLimit;

  validateConfiguredLimits(defaultLimit, hardLimit);

  if (typeof requestedLimit === 'number') {
    assertPositiveInteger(requestedLimit, '--limit');
  }

  return limitReport(defaultLimit, hardLimit, requestedLimit);
};

const selectPrimeRecords = (options: SelectPrimeOptions): PrimeSelection => {
  const filters = normalizedFilters(options.filters);
  const limit = resolveLimits(options.requestedLimit, options.limits);
  const matchingRecords = options.records
    .filter((candidate) => candidateMatches(candidate, options.registry, options.context, filters))
    .map((candidate) => toSelectedRecord(candidate, options.registry, options.context, options.now))
    .sort(compareSelectedRecords);
  const records = matchingRecords.slice(0, limit.effectiveLimit);

  return {
    generatedAt: options.now.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    filters,
    limit,
    scannedRecordCount: options.records.length,
    failedReadCount: options.failedReadCount ?? 0,
    totalMatchingRecordCount: matchingRecords.length,
    shownRecordCount: records.length,
    omittedRecordCount: Math.max(0, matchingRecords.length - records.length),
    records,
  };
};

export { selectPrimeRecords };
export type {
  PrimeCandidateRecord,
  PrimeFilters,
  PrimeLimitDefaults,
  PrimeLimitReport,
  PrimeSelectedRecord,
  PrimeSelection,
  SelectPrimeOptions,
};
