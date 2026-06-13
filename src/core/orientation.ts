import { lifecycleStatusKindFor } from './lifecycle.js';
import { isoTimestamp } from './time.js';
import type { LifecycleStatusKind, RecordTypeRegistry } from './record-type-types.js';

type OrientationLifecycleKind = LifecycleStatusKind | 'unknown';

type OrientationVocabularyStatus = 'approved' | 'provisional' | 'rejected';

/*
 * The orientation builder intentionally accepts only frontmatter-derived
 * (record_type, status) pairs — never full records — so it structurally cannot
 * read bodies, call RecordType.validate, or call summarizeForList. That is the
 * load-bearing WI-R01 invariant: prime orientation runs no validation and never
 * summarizes bodies, deriving counts from frontmatter plus static lifecycle metadata.
 */
interface OrientationRecordInput {
  readonly recordType: string;
  readonly status: string;
}

interface OrientationVocabularyTermInput {
  readonly status: OrientationVocabularyStatus;
}

interface OrientationPolicyDoc {
  readonly name: string;
  readonly relativePath: string;
  readonly appliesTo: ReadonlyArray<string>;
}

interface BuildOrientationOptions {
  readonly records: ReadonlyArray<OrientationRecordInput>;
  readonly failedReadCount: number;
  readonly registry: RecordTypeRegistry;
  readonly vocabularyTerms: ReadonlyArray<OrientationVocabularyTermInput>;
  readonly policyDocs: ReadonlyArray<OrientationPolicyDoc>;
  readonly now: Date;
}

interface OrientationStatusCount {
  readonly status: string;
  readonly kind: OrientationLifecycleKind;
  readonly count: number;
}

interface OrientationRecordTypeCount {
  readonly recordType: string;
  readonly total: number;
  readonly statuses: ReadonlyArray<OrientationStatusCount>;
}

interface OrientationLifecycleCount {
  readonly kind: OrientationLifecycleKind;
  readonly count: number;
}

interface OrientationVocabularyCount {
  readonly status: OrientationVocabularyStatus;
  readonly count: number;
}

interface Orientation {
  readonly generatedAt: string;
  readonly totalRecordCount: number;
  readonly unreadableRecordCount: number;
  readonly recordTypes: ReadonlyArray<OrientationRecordTypeCount>;
  readonly lifecycle: ReadonlyArray<OrientationLifecycleCount>;
  readonly vocabulary: ReadonlyArray<OrientationVocabularyCount>;
  readonly policyDocs: ReadonlyArray<OrientationPolicyDoc>;
  readonly nextCommands: ReadonlyArray<string>;
}

/*
 * Fixed ordering so orientation output is deterministic regardless of record or
 * vocabulary discovery order.
 */
const lifecycleKinds: ReadonlyArray<OrientationLifecycleKind> = ['active', 'terminal', 'unknown'];
const vocabularyStatuses: ReadonlyArray<OrientationVocabularyStatus> = [
  'approved',
  'provisional',
  'rejected',
];

const nextCommands: ReadonlyArray<string> = [
  'introspection records list — review active records before planning',
  'introspection check — validate records before finishing',
  'introspection record create tech-debt — capture newly deferred work',
];

const sortedKeys = (keys: Iterable<string>): ReadonlyArray<string> =>
  [...keys].sort((left, right) => left.localeCompare(right));

const countByStatus = (records: ReadonlyArray<OrientationRecordInput>): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const record of records) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }

  return counts;
};

const groupByRecordType = (
  records: ReadonlyArray<OrientationRecordInput>,
): Map<string, ReadonlyArray<OrientationRecordInput>> => {
  const groups = new Map<string, Array<OrientationRecordInput>>();

  for (const record of records) {
    const group = groups.get(record.recordType) ?? [];
    group.push(record);
    groups.set(record.recordType, group);
  }

  return groups;
};

const statusCountsFor = (
  registry: RecordTypeRegistry,
  recordType: string,
  records: ReadonlyArray<OrientationRecordInput>,
): ReadonlyArray<OrientationStatusCount> => {
  const counts = countByStatus(records);

  return sortedKeys(counts.keys()).map((status) => ({
    status,
    kind: lifecycleStatusKindFor(registry, recordType, status),
    count: counts.get(status) ?? 0,
  }));
};

const recordTypeCountsFor = (
  registry: RecordTypeRegistry,
  records: ReadonlyArray<OrientationRecordInput>,
): ReadonlyArray<OrientationRecordTypeCount> => {
  const groups = groupByRecordType(records);

  return sortedKeys(groups.keys()).map((recordType) => {
    const group = groups.get(recordType) ?? [];

    return {
      recordType,
      total: group.length,
      statuses: statusCountsFor(registry, recordType, group),
    };
  });
};

const lifecycleCountsFor = (
  registry: RecordTypeRegistry,
  records: ReadonlyArray<OrientationRecordInput>,
): ReadonlyArray<OrientationLifecycleCount> => {
  const counts = new Map<OrientationLifecycleKind, number>();

  for (const record of records) {
    const kind = lifecycleStatusKindFor(registry, record.recordType, record.status);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return lifecycleKinds
    .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
    .filter((entry) => entry.count > 0);
};

const vocabularyCountsFor = (
  terms: ReadonlyArray<OrientationVocabularyTermInput>,
): ReadonlyArray<OrientationVocabularyCount> => {
  const counts = new Map<string, number>();

  for (const term of terms) {
    counts.set(term.status, (counts.get(term.status) ?? 0) + 1);
  }

  return vocabularyStatuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
};

const buildOrientation = (options: BuildOrientationOptions): Orientation => ({
  generatedAt: isoTimestamp(options.now),
  totalRecordCount: options.records.length,
  unreadableRecordCount: options.failedReadCount,
  recordTypes: recordTypeCountsFor(options.registry, options.records),
  lifecycle: lifecycleCountsFor(options.registry, options.records),
  vocabulary: vocabularyCountsFor(options.vocabularyTerms),
  policyDocs: options.policyDocs,
  nextCommands,
});

export { buildOrientation };
export type {
  BuildOrientationOptions,
  Orientation,
  OrientationLifecycleCount,
  OrientationLifecycleKind,
  OrientationPolicyDoc,
  OrientationRecordInput,
  OrientationRecordTypeCount,
  OrientationStatusCount,
  OrientationVocabularyCount,
  OrientationVocabularyTermInput,
};
