import type { RepoContext } from '../config/repo-context.js';
import type { BaseRecordFrontmatter, ParsedRecord, RecordType } from '../core/record-type-types.js';

import type { LocalLockContext, LocalLockOptions, LocalNamedLockOptions } from './local-lock.js';
import type { MarkdownRecordStore, StoredMarkdownRecord } from './markdown-record-store.js';

type IdAllocatorContext = LocalLockContext & Readonly<{ recordsRoot: string; repoKey: string }>;

type AllocatedRecordIdentity = Readonly<{ id: string; number: number; relativePath: string }>;

interface AllocateRecordRequest<Frontmatter extends BaseRecordFrontmatter = BaseRecordFrontmatter> {
  readonly context: IdAllocatorContext | RepoContext;
  readonly makeRecord: (identity: AllocatedRecordIdentity) => ParsedRecord<Frontmatter>;
  readonly recordType: RecordType<Frontmatter>;
  readonly store?: MarkdownRecordStore;
  readonly lock?: LocalLockOptions;
}

type AllocateRecordResult = Readonly<{
  identity: AllocatedRecordIdentity;
  record: StoredMarkdownRecord;
}>;

export type {
  AllocateRecordRequest,
  AllocateRecordResult,
  AllocatedRecordIdentity,
  IdAllocatorContext,
};
export type {
  LocalLockContext,
  LocalLockOptions,
  LocalNamedLockOptions,
  LockMetadata,
} from './local-lock.js';
