import type {
  IntrospectionVocabulary,
  RepoContext,
  VocabularyTerm,
} from '../config/repo-context.js';
import type { PrimeSelection } from '../core/prime-selector.js';
import type {
  DeleteVocabularyTermResult,
  VocabularyCascadeResult,
  VocabularyUsageEntry,
} from '../core/vocabulary.js';
import type { CheckReport } from '../core/validation.js';
import type { DuplicateRepairResult } from '../store/duplicate-repair-service.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';

import type { CliErrorPayload } from '../commands/types.js';

interface RecordSummary {
  readonly id: string;
  readonly path: string;
  readonly record_type: string;
  readonly status: string;
  readonly title: string;
}

const jsonIndent = 2;

const renderJson = (value: unknown): string => `${JSON.stringify(value, null, jsonIndent)}\n`;

const recordSummary = (record: StoredMarkdownRecord): RecordSummary => ({
  id: record.frontmatter.id,
  path: record.relativePath,
  record_type: record.frontmatter.record_type,
  status: record.frontmatter.status,
  title: record.frontmatter.title,
});

const checkJson = (report: CheckReport): string => renderJson(report);

const errorJson = (error: CliErrorPayload): string => renderJson({ ok: false, error });

const recordJson = (record: StoredMarkdownRecord): string =>
  renderJson({ ok: true, record: recordSummary(record) });

const transitionJson = (record: StoredMarkdownRecord): string =>
  renderJson({ ok: true, transition: recordSummary(record) });

const repairJson = (result: DuplicateRepairResult): string =>
  renderJson({
    ok: true,
    repair: {
      oldId: result.oldId,
      newId: result.newId,
      oldPath: result.oldPath,
      newPath: result.newPath,
      bodyOccurrences: result.bodyOccurrences,
    },
  });

const primeJson = (repo: RepoContext, selection: PrimeSelection): string =>
  renderJson({
    ok: true,
    prime: {
      repo: {
        key: repo.repoKey,
        slug: repo.repoSlug,
        root: repo.repoRoot,
        recordsRoot: repo.recordsRoot,
      },
      ...selection,
    },
  });

const vocabularyJson = (vocabulary: IntrospectionVocabulary): string =>
  renderJson({ ok: true, vocabulary });

const vocabularyTermsJson = (terms: ReadonlyArray<VocabularyTerm>): string =>
  renderJson({ ok: true, terms });

const vocabularyUsageJson = (usage: ReadonlyArray<VocabularyUsageEntry>): string =>
  renderJson({ ok: true, usage });

const vocabularyCascadeJson = (result: VocabularyCascadeResult): string =>
  renderJson({
    ok: true,
    cascade: {
      fromTag: result.fromTag,
      toTag: result.toTag,
      changedRecordPaths: result.changedRecordPaths,
    },
    vocabulary: result.vocabulary,
  });

const vocabularyDeleteJson = (result: DeleteVocabularyTermResult): string =>
  renderJson({ ok: true, deletedTag: result.deletedTag, vocabulary: result.vocabulary });

export {
  checkJson,
  errorJson,
  primeJson,
  recordJson,
  repairJson,
  transitionJson,
  vocabularyCascadeJson,
  vocabularyDeleteJson,
  vocabularyJson,
  vocabularyTermsJson,
  vocabularyUsageJson,
};
