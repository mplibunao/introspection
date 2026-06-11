import type { RepoContext } from '../config/repo-context.js';
import type { BaseRecordFrontmatter, ParsedRecord, RecordType } from '../core/record-type-types.js';

import type { MarkdownRecordStore, StoredMarkdownRecord } from './markdown-record-store.js';

type IdAllocatorContext = Readonly<{ locksRoot: string; recordsRoot: string; repoKey: string }>;

type AllocatedRecordIdentity = Readonly<{ id: string; number: number; relativePath: string }>;

type LocalLockOptions = Readonly<{
  maxWaitMs?: number;
  retryDelayMs?: number;
  staleAfterMs?: number;
}>;

type LockMetadata = Readonly<{ ownerToken: string; pid: number; timestamp: string }>;

type LockDirectoryRuntime = Readonly<{
  lockPath: string;
  metadataPath: string;
  options: Required<LocalLockOptions>;
  ownerToken: string;
}>;

type LocalLockRuntime = LockDirectoryRuntime &
  Readonly<{ adminLockPath: string; adminMetadataPath: string }>;

type LockMutationDecision = Readonly<{ acquired: boolean; quarantinePath?: string }>;

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
  LocalLockOptions,
  LockDirectoryRuntime,
  LocalLockRuntime,
  LockMetadata,
  LockMutationDecision,
};
