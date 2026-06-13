import type { CheckFinding, CheckReport } from '../core/validation.js';
import type { RepoContext, VocabularyTerm } from '../config/repo-context.js';
import type {
  Orientation,
  OrientationLifecycleCount,
  OrientationPolicyDoc,
  OrientationRecordTypeCount,
  OrientationVocabularyCount,
} from '../core/orientation.js';
import type { RecordListFilters, RecordListResult } from '../core/record-list-selector.js';
import type { ExportServiceResult } from '../export/export-service.js';
import type {
  DeleteVocabularyTermResult,
  VocabularyCascadeResult,
  VocabularyUsageEntry,
} from '../core/vocabulary.js';
import type { DuplicateRepairResult } from '../store/duplicate-repair-service.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';

import type { CliErrorPayload } from '../commands/types.js';

const newline = '\n';

const line = (value: string): string => `${value}${newline}`;

const findingLocation = (finding: CheckFinding): string => {
  if (finding.recordPath && finding.recordId) {
    return `${finding.recordId} (${finding.recordPath})`;
  }

  if (finding.recordPath) {
    return finding.recordPath;
  }

  return finding.source;
};

const remediationSuffix = (finding: CheckFinding): string => {
  if (finding.remediation) {
    return ` Remediation: ${finding.remediation}`;
  }

  return '';
};

const findingLine = (finding: CheckFinding): string =>
  `- [${finding.severity}] ${finding.code} at ${findingLocation(finding)}: ${finding.message}${remediationSuffix(finding)}`;

const checkHuman = (report: CheckReport): string => {
  if (report.ok) {
    return line(`Check passed: ${report.checkedRecordCount} record(s) checked.`);
  }

  return `${[
    `Check failed: ${report.findings.length} finding(s) across ${report.checkedRecordCount} parsed record(s).`,
    ...report.findings.map(findingLine),
  ].join(newline)}${newline}`;
};

const errorHuman = (error: CliErrorPayload): string =>
  line(`Error ${error.code}: ${error.message}`);

const exportHuman = (result: ExportServiceResult): string =>
  line(
    `Exported ${result.recordsExported} record(s) to ${result.destinationDirectory}; manifest ${result.manifestPath}.`,
  );

const recordHuman = (record: StoredMarkdownRecord): string =>
  line(`Created ${record.frontmatter.id}: ${record.relativePath}`);

const transitionHuman = (record: StoredMarkdownRecord): string =>
  line(
    `Transitioned ${record.frontmatter.id} to ${record.frontmatter.status}: ${record.relativePath}`,
  );

const repairHuman = (result: DuplicateRepairResult): string =>
  `${[
    `Repaired duplicate ${result.oldId} → ${result.newId}.`,
    `Moved ${result.oldPath} → ${result.newPath}.`,
    `Body prose occurrences reported: ${result.bodyOccurrences.length}.`,
  ].join(newline)}${newline}`;

const filterValues = (label: string, values: ReadonlyArray<string>): string | null => {
  if (values.length === 0) {
    return null;
  }

  return `${label}=${values.join(',')}`;
};

const flagLabel = (enabled: boolean, label: string): string | null => {
  if (enabled) {
    return label;
  }

  return null;
};

const recordListFilterSummary = (filters: Required<RecordListFilters>): string => {
  const parts = [
    filterValues('type', filters.types),
    filterValues('status', filters.statuses),
    filterValues('tag', filters.tags),
    filterValues('path', filters.paths),
    flagLabel(filters.includeTerminal, 'include-terminal'),
    flagLabel(filters.all, 'all'),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return 'active records';
  }

  return parts.join('; ');
};

const recordListLimitSuffix = (selection: RecordListResult): string => {
  if (!selection.limit.clamped) {
    return `limit ${selection.limit.effectiveLimit}`;
  }

  return `limit ${selection.limit.effectiveLimit} (clamped from ${selection.limit.requestedLimit})`;
};

const recordListLine = (record: RecordListResult['records'][number]): string =>
  `- ${record.id} [${record.recordType}/${record.status}] ${record.title} (${record.path}; updated ${record.updatedAt}; age ${record.ageDays}d)`;

const unreadableRecordWarning = (selection: RecordListResult): ReadonlyArray<string> => {
  if (selection.failedReadCount === 0) {
    return [];
  }

  return [
    `Skipped unreadable records: ${selection.failedReadCount}. Run introspection check for details.`,
  ];
};

const recordListHuman = (repo: RepoContext, selection: RecordListResult): string => {
  const header = [
    `Records for ${repo.repoKey}/${repo.repoSlug}: showing ${selection.shownRecordCount} of ${selection.totalMatchingRecordCount} matching record(s); omitted ${selection.omittedRecordCount}; ${recordListLimitSuffix(selection)}.`,
    `Scope: ${recordListFilterSummary(selection.filters)}.`,
  ];
  const records = selection.records.flatMap((record) => [
    recordListLine(record),
    `  ${record.summary}`,
  ]);

  return `${[...header, ...unreadableRecordWarning(selection), ...records].join(newline)}${newline}`;
};

const orientationTypeLine = (entry: OrientationRecordTypeCount): string => {
  const statuses = entry.statuses
    .map((status) => `${status.status}[${status.kind}] ${status.count}`)
    .join('; ');

  return `- ${entry.recordType}: ${entry.total} (${statuses})`;
};

const recordTypeLines = (
  recordTypes: ReadonlyArray<OrientationRecordTypeCount>,
): ReadonlyArray<string> => {
  if (recordTypes.length === 0) {
    return ['By type: none.'];
  }

  return ['By type:', ...recordTypes.map(orientationTypeLine)];
};

const orientationLifecycleLine = (lifecycle: ReadonlyArray<OrientationLifecycleCount>): string => {
  if (lifecycle.length === 0) {
    return 'By lifecycle: none.';
  }

  const parts = lifecycle.map((entry) => `${entry.kind} ${entry.count}`).join('; ');

  return `By lifecycle: ${parts}.`;
};

const orientationVocabularyLine = (
  vocabulary: ReadonlyArray<OrientationVocabularyCount>,
): string => {
  const parts = vocabulary.map((entry) => `${entry.status} ${entry.count}`).join('; ');

  return `Vocabulary: ${parts}.`;
};

const policyDocLine = (doc: OrientationPolicyDoc): string => {
  if (doc.appliesTo.length === 0) {
    return `- ${doc.name} (${doc.relativePath})`;
  }

  return `- ${doc.name} (${doc.relativePath}; applies to: ${doc.appliesTo.join(', ')})`;
};

const policyDocLines = (docs: ReadonlyArray<OrientationPolicyDoc>): ReadonlyArray<string> => {
  if (docs.length === 0) {
    return ['Policy docs: none.'];
  }

  return ['Policy docs:', ...docs.map(policyDocLine)];
};

const orientationHuman = (repo: RepoContext, orientation: Orientation): string => {
  const header = [
    `Orientation for ${repo.repoKey}/${repo.repoSlug}.`,
    `Repo root: ${repo.repoRoot}`,
    `Records root: ${repo.recordsRoot}`,
    `Records: ${orientation.totalRecordCount} total; ${orientation.unreadableRecordCount} unreadable.`,
  ];
  const summary = [
    orientationLifecycleLine(orientation.lifecycle),
    orientationVocabularyLine(orientation.vocabulary),
  ];
  const next = ['Next:', ...orientation.nextCommands.map((command) => `- ${command}`)];
  const lines = [
    ...header,
    ...recordTypeLines(orientation.recordTypes),
    ...summary,
    ...policyDocLines(orientation.policyDocs),
    ...next,
  ];

  return `${lines.join(newline)}${newline}`;
};

const vocabularyTermLine = (term: VocabularyTerm): string =>
  `- ${term.tag} [${term.status}] ${term.description}`;

const vocabularyTermsHuman = (terms: ReadonlyArray<VocabularyTerm>): string => {
  if (terms.length === 0) {
    return line('No vocabulary terms matched.');
  }

  return `${terms.map(vocabularyTermLine).join(newline)}${newline}`;
};

const vocabularyMutationHuman = (action: string, tag: string): string =>
  line(`${action} vocabulary term ${tag}.`);

const vocabularyCascadeHuman = (result: VocabularyCascadeResult, action: string): string =>
  `${[
    `${action} ${result.fromTag} → ${result.toTag}.`,
    `Changed records: ${result.changedRecordPaths.length}`,
    ...result.changedRecordPaths.map((recordPath) => `- ${recordPath}`),
  ].join(newline)}${newline}`;

const vocabularyUsageHuman = (usage: ReadonlyArray<VocabularyUsageEntry>): string => {
  const lines = usage.flatMap((entry) => [
    `${entry.tag}: ${entry.records.length} record(s)`,
    ...entry.records.map((record) => `- ${record.id} ${record.path}`),
  ]);

  return `${lines.join(newline)}${newline}`;
};

const vocabularyDeleteHuman = (result: DeleteVocabularyTermResult): string =>
  line(`Deleted unused vocabulary term ${result.deletedTag}.`);

export {
  checkHuman,
  errorHuman,
  exportHuman,
  orientationHuman,
  recordHuman,
  recordListHuman,
  repairHuman,
  transitionHuman,
  vocabularyCascadeHuman,
  vocabularyDeleteHuman,
  vocabularyMutationHuman,
  vocabularyTermsHuman,
  vocabularyUsageHuman,
};
