import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { RecordStoreError, StaleRecordError } from '../core/errors.js';
import {
  canonicalRecordRelativePath,
  duplicateRecordIdGroups,
  nextRecordNumber,
  renderRecordId,
} from '../core/id.js';
import type {
  BaseRecordFrontmatter,
  ConversionTarget,
  EvidenceRef,
  RecordType,
  Resolution,
  SourceBlock,
} from '../core/record-type-types.js';
import type { RepoContext } from '../config/repo-context.js';

import { withLocalIdLock } from './id-allocator.js';
import type { IdAllocatorContext, LocalLockOptions } from './id-allocator-types.js';
import { createMarkdownRecordStore, hashRawBytes } from './markdown-record-store.js';

type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type StoredMarkdownRecord = Awaited<ReturnType<MarkdownRecordStore['readRecord']>>;

interface DuplicateRepairRequest<
  Frontmatter extends BaseRecordFrontmatter = BaseRecordFrontmatter,
> {
  readonly context: IdAllocatorContext | RepoContext;
  readonly lock?: LocalLockOptions;
  readonly record: StoredMarkdownRecord;
  readonly recordType: RecordType<Frontmatter>;
  readonly store?: MarkdownRecordStore;
}

interface BodyReferenceOccurrence {
  readonly column: number;
  readonly line: number;
  readonly recordPath: string;
  readonly value: string;
}

interface DuplicateRepairResult {
  readonly bodyOccurrences: ReadonlyArray<BodyReferenceOccurrence>;
  readonly newId: string;
  readonly newNumber: number;
  readonly newPath: string;
  readonly oldId: string;
  readonly oldPath: string;
  readonly record: StoredMarkdownRecord;
}

interface RefRewriteValues {
  readonly newId: string;
  readonly newPath: string;
  readonly oldId: string;
  readonly oldPath: string;
}

interface DuplicateRepairPlan {
  readonly bodyOccurrences: ReadonlyArray<BodyReferenceOccurrence>;
  readonly newId: string;
  readonly newNumber: number;
  readonly newPath: string;
  readonly oldId: string;
  readonly oldPath: string;
  readonly refs: RefRewriteValues;
}

interface StructuredRefUpdateProgress {
  updatedCount: number;
}

const missingStringIndex = -1;

const rewriteReferenceValue = (value: string, refs: RefRewriteValues): string => {
  if (value === refs.oldId) {
    return refs.newId;
  }

  if (value === refs.oldPath) {
    return refs.newPath;
  }

  return value;
};

const rewriteEvidenceRefs = (
  evidenceRefs: ReadonlyArray<EvidenceRef> | undefined,
  refs: RefRewriteValues,
): ReadonlyArray<EvidenceRef> | undefined =>
  evidenceRefs?.map((evidenceRef) => ({
    ...evidenceRef,
    ref: rewriteReferenceValue(evidenceRef.ref, refs),
  }));

const rewriteConversionTargets = (
  conversionTargets: ReadonlyArray<ConversionTarget> | undefined,
  refs: RefRewriteValues,
): ReadonlyArray<ConversionTarget> | undefined =>
  conversionTargets?.map((target) => ({
    ...target,
    ref: rewriteReferenceValue(target.ref, refs),
  }));

const optionalField = <Value>(key: string, value: Value | undefined): Record<string, Value> => {
  if (typeof value === 'undefined') {
    return {};
  }

  return { [key]: value };
};

const rewriteResolutionReferenceFields = (
  resolution: Resolution | undefined,
  refs: RefRewriteValues,
): Resolution | undefined => {
  if (!resolution) {
    return resolution;
  }

  return {
    ...resolution,
    ...optionalField('evidence_refs', rewriteEvidenceRefs(resolution.evidence_refs, refs)),
  };
};

const rewriteSourceReferenceFields = (
  source: SourceBlock | undefined,
  refs: RefRewriteValues,
): SourceBlock | undefined => {
  if (!source) {
    return source;
  }

  return {
    ...source,
    refs: rewriteEvidenceRefs(source.refs, refs) ?? [],
  };
};

const rewriteReferenceFields = (
  frontmatter: BaseRecordFrontmatter,
  refs: RefRewriteValues,
): BaseRecordFrontmatter => ({
  ...frontmatter,
  ...optionalField(
    'conversion_targets',
    rewriteConversionTargets(frontmatter.conversion_targets, refs),
  ),
  ...optionalField('resolution', rewriteResolutionReferenceFields(frontmatter.resolution, refs)),
  ...optionalField('source', rewriteSourceReferenceFields(frontmatter.source, refs)),
});

const rewriteRepairedRecordFrontmatter = (
  frontmatter: BaseRecordFrontmatter,
  refs: RefRewriteValues,
  newNumber: number,
): BaseRecordFrontmatter => ({
  ...rewriteReferenceFields(frontmatter, refs),
  id: refs.newId,
  number: newNumber,
});

const findBodyOccurrences = (
  body: string,
  values: ReadonlyArray<string>,
  recordPath = '',
): ReadonlyArray<BodyReferenceOccurrence> => {
  const lines = body.split('\n');
  const occurrences: Array<BodyReferenceOccurrence> = [];
  const searchValues = values.filter((value) => value.length > 0);

  lines.forEach((lineText, lineIndex) => {
    for (const value of searchValues) {
      let searchFrom = 0;

      while (searchFrom <= lineText.length) {
        const matchIndex = lineText.indexOf(value, searchFrom);

        if (matchIndex === missingStringIndex) {
          break;
        }

        occurrences.push({
          column: matchIndex + 1,
          line: lineIndex + 1,
          recordPath,
          value,
        });
        searchFrom = matchIndex + value.length;
      }
    }
  });

  return occurrences;
};

const recordBodyOccurrences = (
  record: StoredMarkdownRecord,
  values: ReadonlyArray<string>,
): ReadonlyArray<BodyReferenceOccurrence> =>
  findBodyOccurrences(record.body, values, record.relativePath);

const repairedPathFor = (recordType: RecordType, status: string, id: string): string =>
  canonicalRecordRelativePath({
    id,
    recordTypeKey: recordType.key,
    status,
  });

const assertRecordPathMatchesScopedRead = (
  record: StoredMarkdownRecord,
  scopedRecord: StoredMarkdownRecord,
): void => {
  if (path.resolve(record.absolutePath) !== path.resolve(scopedRecord.absolutePath)) {
    throw new RecordStoreError(
      'duplicate_repair.record_scope_mismatch',
      'Duplicate repair record must resolve to the same path through the scoped records store.',
      { passedPath: record.absolutePath, scopedPath: scopedRecord.absolutePath },
    );
  }
};

const assertRecordHashMatchesScopedRead = (
  record: StoredMarkdownRecord,
  scopedRecord: StoredMarkdownRecord,
): void => {
  if (record.hash !== scopedRecord.hash) {
    throw new StaleRecordError('Record changed before duplicate repair started.', {
      actualHash: scopedRecord.hash,
      expectedHash: record.hash,
      path: scopedRecord.absolutePath,
    });
  }
};

const readScopedRepairRecord = async (
  store: MarkdownRecordStore,
  record: StoredMarkdownRecord,
): Promise<StoredMarkdownRecord> => {
  const scopedRecord = await store.readRecord(record.relativePath);
  assertRecordPathMatchesScopedRead(record, scopedRecord);
  assertRecordHashMatchesScopedRead(record, scopedRecord);

  return scopedRecord;
};

const assertRecordIsDuplicate = (
  record: StoredMarkdownRecord,
  records: ReadonlyArray<StoredMarkdownRecord>,
): void => {
  const duplicateGroup = duplicateRecordIdGroups(records).find(
    (group) => group.id === record.frontmatter.id,
  );

  if (!duplicateGroup) {
    throw new RecordStoreError(
      'duplicate_repair.not_duplicate',
      'Duplicate repair requires a record whose ID appears more than once in the records root.',
      { id: record.frontmatter.id, path: record.relativePath },
    );
  }
};

const assertStoreRootMatchesContext = (
  context: IdAllocatorContext | RepoContext,
  store: MarkdownRecordStore,
): void => {
  if (path.resolve(store.root) !== path.resolve(context.recordsRoot)) {
    throw new RecordStoreError(
      'duplicate_repair.store_root_mismatch',
      'Duplicate repair store must be rooted at the configured records root.',
      { recordsRoot: context.recordsRoot, storeRoot: store.root },
    );
  }
};

const createDuplicateRepairPlan = (
  context: IdAllocatorContext | RepoContext,
  record: StoredMarkdownRecord,
  recordType: RecordType,
  records: ReadonlyArray<StoredMarkdownRecord>,
): DuplicateRepairPlan => {
  const newNumber = nextRecordNumber(records, { repoKey: context.repoKey, recordType });
  const newId = renderRecordId({
    repoKey: context.repoKey,
    typePrefix: recordType.idPrefix,
    number: newNumber,
  });
  const oldId = record.frontmatter.id;
  const oldPath = record.relativePath;
  const newPath = repairedPathFor(recordType, record.frontmatter.status, newId);
  const refs = { newId, newPath, oldId, oldPath };
  const bodyOccurrences = records.flatMap((candidate) =>
    recordBodyOccurrences(candidate, [oldId, oldPath]),
  );

  return { bodyOccurrences, newId, newNumber, newPath, oldId, oldPath, refs };
};

const frontmatterChanged = (before: BaseRecordFrontmatter, after: BaseRecordFrontmatter): boolean =>
  JSON.stringify(before) !== JSON.stringify(after);

const recordWithStructuredRefsRewritten = (
  record: StoredMarkdownRecord,
  plan: DuplicateRepairPlan,
): StoredMarkdownRecord => ({
  ...record,
  frontmatter: rewriteReferenceFields(record.frontmatter, plan.refs),
  body: record.body,
});

const repairedTargetRecord = (
  record: StoredMarkdownRecord,
  plan: DuplicateRepairPlan,
): StoredMarkdownRecord => ({
  ...record,
  frontmatter: rewriteRepairedRecordFrontmatter(record.frontmatter, plan.refs, plan.newNumber),
  body: record.body,
});

const updateStructuredRefsAcrossRecords = async (
  store: MarkdownRecordStore,
  records: ReadonlyArray<StoredMarkdownRecord>,
  plan: DuplicateRepairPlan,
  progress: StructuredRefUpdateProgress,
): Promise<void> => {
  for (const record of records.filter((candidate) => candidate.relativePath !== plan.oldPath)) {
    const updated = recordWithStructuredRefsRewritten(record, plan);

    if (frontmatterChanged(record.frontmatter, updated.frontmatter)) {
      await store.updateRecord(record, updated);
      progress.updatedCount += 1;
    }
  }
};

const assertOriginalRecordUnchanged = async (record: StoredMarkdownRecord): Promise<void> => {
  const currentBytes = await readFile(record.absolutePath);

  if (hashRawBytes(currentBytes) !== record.hash) {
    throw new StaleRecordError('Record changed before duplicate repair could mutate records.', {
      path: record.absolutePath,
    });
  }
};

const deleteOriginalRecordIfUnchanged = async (record: StoredMarkdownRecord): Promise<void> => {
  await assertOriginalRecordUnchanged(record);
  await unlink(record.absolutePath);
};

const cleanupCreatedRepairTarget = async (
  record: StoredMarkdownRecord,
  progress: StructuredRefUpdateProgress,
): Promise<void> => {
  if (progress.updatedCount > 0) {
    // Keep the repaired target so any already-rewritten structured refs do not dangle.
    return;
  }

  try {
    await unlink(record.absolutePath);
  } catch {
    // Best effort: the original duplicate remains until a later repair/check pass if cleanup fails.
  }
};

const applyDuplicateRepairPlan = async (
  store: MarkdownRecordStore,
  record: StoredMarkdownRecord,
  records: ReadonlyArray<StoredMarkdownRecord>,
  plan: DuplicateRepairPlan,
): Promise<StoredMarkdownRecord> => {
  const progress: StructuredRefUpdateProgress = { updatedCount: 0 };
  await assertOriginalRecordUnchanged(record);
  const created = await store.createRecord(plan.newPath, repairedTargetRecord(record, plan));

  try {
    await updateStructuredRefsAcrossRecords(store, records, plan, progress);
    await deleteOriginalRecordIfUnchanged(record);

    return created;
  } catch (error) {
    await cleanupCreatedRepairTarget(created, progress);
    throw error;
  }
};

const repairDuplicateRecordIdInsideLock = async <Frontmatter extends BaseRecordFrontmatter>({
  context,
  record,
  recordType,
  store = createMarkdownRecordStore({ root: context.recordsRoot }),
}: DuplicateRepairRequest<Frontmatter>): Promise<DuplicateRepairResult> => {
  assertStoreRootMatchesContext(context, store);
  const scopedRecord = await readScopedRepairRecord(store, record);
  const records = await store.listRecords();
  assertRecordIsDuplicate(scopedRecord, records);
  const plan = createDuplicateRepairPlan(context, scopedRecord, recordType, records);
  const repaired = await applyDuplicateRepairPlan(store, scopedRecord, records, plan);

  return {
    bodyOccurrences: plan.bodyOccurrences,
    newId: plan.newId,
    newNumber: plan.newNumber,
    newPath: plan.newPath,
    oldId: plan.oldId,
    oldPath: plan.oldPath,
    record: repaired,
  };
};

const repairDuplicateRecordId = async <Frontmatter extends BaseRecordFrontmatter>(
  request: DuplicateRepairRequest<Frontmatter>,
): Promise<DuplicateRepairResult> =>
  withLocalIdLock(
    request.context,
    request.recordType,
    async () => repairDuplicateRecordIdInsideLock(request),
    request.lock,
  );

export { findBodyOccurrences, repairDuplicateRecordId, rewriteReferenceFields };
export type { BodyReferenceOccurrence, DuplicateRepairRequest, DuplicateRepairResult };
