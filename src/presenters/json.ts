import type {
  IntrospectionVocabulary,
  RepoContext,
  VocabularyTerm,
} from '../config/repo-context.js';
import type { Orientation } from '../core/orientation.js';
import type { RecordListResult } from '../core/record-list-selector.js';
import type { ExportServiceResult } from '../export/export-service.js';
import type { ImportEntryReport, ImportReport } from '../import/import-service.js';
import type { JsonSchemaDocument } from '../core/record-type-types.js';
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

const repoJson = (
  repo: RepoContext,
): { key: string; slug: string; root: string; recordsRoot: string } => ({
  key: repo.repoKey,
  slug: repo.repoSlug,
  root: repo.repoRoot,
  recordsRoot: repo.recordsRoot,
});

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

const exportJson = (result: ExportServiceResult): string =>
  renderJson({
    ok: true,
    export: {
      destinationDirectory: result.destinationDirectory,
      manifestPath: result.manifestPath,
      recordsExported: result.recordsExported,
      manifest: result.manifest,
    },
  });

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

const recordListJson = (repo: RepoContext, selection: RecordListResult): string =>
  renderJson({ ok: true, list: { repo: repoJson(repo), ...selection } });

const importEntryJson = (
  entry: ImportEntryReport,
): {
  record_id: string;
  number: number;
  status: string;
  path: string;
  legacy_id?: string;
  findings: ImportEntryReport['findings'];
} => ({
  record_id: entry.recordId,
  number: entry.number,
  status: entry.status,
  path: entry.relativePath,
  ...(entry.legacyId && { legacy_id: entry.legacyId }),
  findings: entry.findings,
});

const importJson = (repo: RepoContext, report: ImportReport): string =>
  renderJson({
    ok: report.ok,
    import: {
      repo: repoJson(repo),
      written: report.written,
      record_type: report.recordType,
      id_policy: report.idPolicy,
      entries: report.entries.map(importEntryJson),
    },
  });

const importSchemaJson = (schema: JsonSchemaDocument): string => renderJson(schema);

const orientationJson = (repo: RepoContext, orientation: Orientation): string =>
  renderJson({ ok: true, orientation: { repo: repoJson(repo), ...orientation } });

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
  exportJson,
  importJson,
  importSchemaJson,
  orientationJson,
  recordJson,
  recordListJson,
  repairJson,
  transitionJson,
  vocabularyCascadeJson,
  vocabularyDeleteJson,
  vocabularyJson,
  vocabularyTermsJson,
  vocabularyUsageJson,
};
