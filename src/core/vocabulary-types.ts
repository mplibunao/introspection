import type {
  IntrospectionVocabulary,
  VocabularyProvenance,
  VocabularyTerm,
} from '../config/repo-context.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';
import type { ParsedRecord } from './record-type-types.js';

interface VocabularyRecordStore {
  readonly root: string;
  listRecords(): Promise<ReadonlyArray<StoredMarkdownRecord>>;
  updateRecord(record: StoredMarkdownRecord, update: ParsedRecord): Promise<StoredMarkdownRecord>;
}

interface VocabularyMutationContext {
  readonly locksRoot: string;
  readonly recordsRoot: string;
  readonly vocabularyPath: string;
}

interface VocabularyReadContext extends VocabularyMutationContext {
  readonly vocabulary: IntrospectionVocabulary;
}

/** @deprecated Use VocabularyReadContext for read operations or VocabularyMutationContext for mutations. */
type VocabularyServiceContext = VocabularyReadContext;

interface VocabularyListOptions {
  readonly status?: VocabularyTerm['status'];
}

interface VocabularyTermInput {
  readonly aliases?: ReadonlyArray<string>;
  readonly applies_to?: ReadonlyArray<string>;
  readonly description: string;
  readonly provenance: VocabularyProvenance;
  readonly tag: string;
}

interface VocabularyMutationRequest {
  readonly context: VocabularyMutationContext;
}

interface VocabularyTermMutationRequest extends VocabularyMutationRequest {
  readonly tag: string;
}

interface ProposeVocabularyTermRequest extends VocabularyMutationRequest {
  readonly term: VocabularyTermInput;
}

interface RenameVocabularyTagRequest extends VocabularyMutationRequest {
  readonly fromTag: string;
  readonly store: VocabularyRecordStore;
  readonly toTag: string;
}

interface MergeVocabularyTagRequest extends VocabularyMutationRequest {
  readonly fromTag: string;
  readonly store: VocabularyRecordStore;
  readonly toTag: string;
}

interface DeleteVocabularyTermRequest extends VocabularyTermMutationRequest {
  readonly store: VocabularyRecordStore;
}

interface VocabularyUsageRecord {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

interface VocabularyUsageEntry {
  readonly records: ReadonlyArray<VocabularyUsageRecord>;
  readonly tag: string;
}

interface VocabularyCascadeResult {
  readonly changedRecordPaths: ReadonlyArray<string>;
  readonly fromTag: string;
  readonly toTag: string;
  readonly vocabulary: IntrospectionVocabulary;
}

interface DeleteVocabularyTermResult {
  readonly deletedTag: string;
  readonly vocabulary: IntrospectionVocabulary;
}

export type {
  DeleteVocabularyTermRequest,
  DeleteVocabularyTermResult,
  MergeVocabularyTagRequest,
  ProposeVocabularyTermRequest,
  RenameVocabularyTagRequest,
  VocabularyCascadeResult,
  VocabularyListOptions,
  VocabularyMutationRequest,
  VocabularyMutationContext,
  VocabularyReadContext,
  VocabularyRecordStore,
  VocabularyServiceContext,
  VocabularyTermInput,
  VocabularyTermMutationRequest,
  VocabularyUsageEntry,
  VocabularyUsageRecord,
};
