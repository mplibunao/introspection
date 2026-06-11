import { IntrospectionError } from '../core/errors.js';
import { canonicalRecordRelativePath, nextRecordNumber, renderRecordId } from '../core/id.js';
import type { BaseRecordFrontmatter, ParsedRecord, RecordType } from '../core/record-type-types.js';
import type { RepoContext } from '../config/repo-context.js';

import type {
  AllocateRecordRequest,
  AllocateRecordResult,
  AllocatedRecordIdentity,
  IdAllocatorContext,
  LocalLockOptions,
  LocalNamedLockOptions,
} from './id-allocator-types.js';
import { withLocalNamedLock } from './local-lock.js';
import { createMarkdownRecordStore } from './markdown-record-store.js';

class IdAllocationError extends IntrospectionError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}

const lockNameFor = (recordType: RecordType): string => `id-allocator-${recordType.key}.lock`;

const idAllocationTimeoutError = (details: {
  readonly lockPath: string;
  readonly maxWaitMs: number;
}): IdAllocationError =>
  new IdAllocationError(
    'id_allocator.lock_timeout',
    'Timed out waiting for the ID allocation lock.',
    details,
  );

const idLockOptions = (options?: LocalLockOptions): LocalNamedLockOptions => {
  if (!options) {
    return { timeoutError: idAllocationTimeoutError };
  }

  return { lock: options, timeoutError: idAllocationTimeoutError };
};

const withLocalIdLock = async <Result>(
  context: IdAllocatorContext | RepoContext,
  recordType: RecordType,
  work: () => Promise<Result>,
  options?: LocalLockOptions,
): Promise<Result> =>
  withLocalNamedLock(context, lockNameFor(recordType), work, idLockOptions(options));

const createIdentity = (
  context: IdAllocatorContext | RepoContext,
  recordType: RecordType,
  number: number,
  status: string,
): AllocatedRecordIdentity => {
  const id = renderRecordId({ repoKey: context.repoKey, typePrefix: recordType.idPrefix, number });

  return {
    id,
    number,
    relativePath: canonicalRecordRelativePath({
      id,
      recordTypeKey: recordType.key,
      status,
    }),
  };
};

const assertFactoryPreservedIdentity = (
  identity: AllocatedRecordIdentity,
  record: ParsedRecord,
): void => {
  if (record.frontmatter.id !== identity.id || record.frontmatter.number !== identity.number) {
    throw new IdAllocationError(
      'id_allocator.identity_mismatch',
      'Allocated record factory must preserve the assigned ID and number.',
      {
        expected: identity,
        actual: {
          id: record.frontmatter.id,
          number: record.frontmatter.number,
        },
      },
    );
  }
};

const allocateRecordInsideLock = async <Frontmatter extends BaseRecordFrontmatter>({
  context,
  makeRecord,
  recordType,
  store = createMarkdownRecordStore({ root: context.recordsRoot }),
}: AllocateRecordRequest<Frontmatter>): Promise<AllocateRecordResult> => {
  const records = await store.listRecords();
  const number = nextRecordNumber(records, { repoKey: context.repoKey, recordType });
  const provisionalIdentity = createIdentity(
    context,
    recordType,
    number,
    recordType.lifecycle.initialStatus,
  );
  const record = makeRecord(provisionalIdentity);
  const identity = createIdentity(context, recordType, number, record.frontmatter.status);

  assertFactoryPreservedIdentity(identity, record);

  const created = await store.createRecord(identity.relativePath, record);

  return { identity, record: created };
};

const allocateRecord = async <Frontmatter extends BaseRecordFrontmatter>(
  request: AllocateRecordRequest<Frontmatter>,
): Promise<AllocateRecordResult> =>
  withLocalIdLock(
    request.context,
    request.recordType,
    async () => allocateRecordInsideLock(request),
    request.lock,
  );

export { IdAllocationError, allocateRecord, lockNameFor, withLocalIdLock };
export type * from './id-allocator-types.js';
