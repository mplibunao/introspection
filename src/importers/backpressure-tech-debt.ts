import { IntrospectionError } from '../core/errors.js';
import { canonicalRecordRelativePath, renderRecordId } from '../core/id.js';
import type { EvidenceRef, ParsedRecord, Visibility } from '../core/record-type-types.js';
import type { TechDebtFrontmatter } from '../record-types/tech-debt-types.js';
import type { MarkdownRecordStore, StoredMarkdownRecord } from '../store/markdown-record-store.js';

interface LegacyBackpressureTechDebtEntry {
  readonly originalId: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

type BackpressureTechDebtImportDisposition = 'kept-open' | 'rejected' | 'superseded';
type BackpressureTechDebtImportStatus = TechDebtFrontmatter['status'];

interface BackpressureTechDebtImportReportRow {
  readonly disposition: BackpressureTechDebtImportDisposition;
  readonly originalId: string;
  readonly rationale: string;
  readonly recordId: string;
  readonly relativePath: string;
  readonly status: BackpressureTechDebtImportStatus;
}

interface BackpressureTechDebtImportReport {
  readonly legacyGapIds: ReadonlyArray<string>;
  readonly nextNumber: number;
  readonly rows: ReadonlyArray<BackpressureTechDebtImportReportRow>;
}

interface BackpressureTechDebtImportedRecord {
  readonly legacyEntry: LegacyBackpressureTechDebtEntry;
  readonly record: ParsedRecord<TechDebtFrontmatter>;
  readonly relativePath: string;
  readonly reportRow: BackpressureTechDebtImportReportRow;
}

interface BackpressureTechDebtImportResult {
  readonly records: ReadonlyArray<BackpressureTechDebtImportedRecord>;
  readonly report: BackpressureTechDebtImportReport;
}

interface BackpressureTechDebtWriteResult extends BackpressureTechDebtImportResult {
  readonly storedRecords: ReadonlyArray<StoredMarkdownRecord>;
}

interface BackpressureTechDebtImportContext {
  readonly defaultVisibility: Visibility;
  readonly repoKey: string;
  readonly repoSlug: string;
}

interface BuildBackpressureTechDebtImportOptions {
  readonly context?: Partial<BackpressureTechDebtImportContext>;
  readonly importedAt?: string;
  readonly markdown: string;
  readonly resolvedAt?: string;
  readonly trackerPath?: string;
}

interface WriteBackpressureTechDebtImportOptions extends BuildBackpressureTechDebtImportOptions {
  readonly store: MarkdownRecordStore;
}

interface DispositionSpec {
  readonly disposition: BackpressureTechDebtImportDisposition;
  readonly evidenceRefs?: ReadonlyArray<EvidenceRef>;
  readonly rationale: string;
  readonly status: BackpressureTechDebtImportStatus;
}

interface ImportRuntime {
  readonly context: BackpressureTechDebtImportContext;
  readonly importedAt: string;
  readonly resolvedAt: string;
  readonly trackerPath: string;
}

const defaultContext: BackpressureTechDebtImportContext = {
  defaultVisibility: 'local-only',
  repoKey: 'BP',
  repoSlug: 'backpressure',
};
const defaultTrackerPath = 'docs/exec-plans/tech-debt-tracker.md';
const defaultImportTimestamp = '2026-06-10T00:00:00Z';
const staleBunMigrationRef = 'docs/exec-plans/active/bun-runtime-migration-2026-06-07.md';
const correctedBunMigrationRef = 'docs/exec-plans/completed/bun-runtime-migration-2026-06-07.md';
const legacyNumberWidth = 3;
const markdownHeadingPattern = /^### (?<originalId>TD-[0-9]{3}): (?<title>.+)$/gmu;

const dispositionSpecs: Readonly<Record<string, DispositionSpec>> = {
  'TD-001': {
    disposition: 'rejected',
    rationale:
      "Tied to executor's application boundaries, not general package material (MP cleanup ruling, 2026-06-01).",
    status: 'rejected',
  },
  'TD-002': {
    disposition: 'superseded',
    evidenceRefs: [{ kind: 'doc', ref: 'docs/design-docs/preset-architecture.md' }],
    rationale: 'Split-trigger policy is owned by the package/preset design docs.',
    status: 'superseded',
  },
  'TD-003': {
    disposition: 'superseded',
    evidenceRefs: [{ kind: 'doc', ref: 'docs/design-docs/rule-intake.md' }],
    rationale: 'Growth criteria are owned by rule intake.',
    status: 'superseded',
  },
  'TD-004': {
    disposition: 'rejected',
    rationale: 'Oxlint-only direction is settled; the portability cross-check was not pursued.',
    status: 'rejected',
  },
  'TD-006': {
    disposition: 'superseded',
    evidenceRefs: [{ kind: 'doc', ref: 'docs/design-docs/rule-intake.md' }],
    rationale:
      "Earn-the-gate candidates are rule intake's job. Add the two named rule candidates (`no-js-extension-imports`, `no-opaque-instance-fields`; reference impls in effect-smol `@effect/oxc`) to `rule-intake.md` if absent during adoption.",
    status: 'superseded',
  },
  'TD-007': {
    disposition: 'kept-open',
    rationale:
      'Kept as an active backpressure follow-up during the introspection migration disposition pass.',
    status: 'open',
  },
  'TD-008': {
    disposition: 'kept-open',
    rationale:
      'Kept as an active backpressure follow-up during the introspection migration disposition pass.',
    status: 'open',
  },
  'TD-009': {
    disposition: 'kept-open',
    rationale:
      'Kept as an active backpressure follow-up during the introspection migration disposition pass.',
    status: 'open',
  },
  'TD-010': {
    disposition: 'kept-open',
    rationale:
      'Kept as an active backpressure follow-up during the introspection migration disposition pass.',
    status: 'open',
  },
  'TD-011': {
    disposition: 'kept-open',
    rationale:
      'Kept as an active backpressure follow-up during the introspection migration disposition pass.',
    status: 'open',
  },
};

const expectedLegacyIds = Object.freeze(Object.keys(dispositionSpecs).sort());

const normalizedContext = (
  context: Partial<BackpressureTechDebtImportContext> = {},
): BackpressureTechDebtImportContext => ({
  ...defaultContext,
  ...context,
});

const sourceRefFor = (
  entry: LegacyBackpressureTechDebtEntry,
  trackerPath: string,
): EvidenceRef => ({
  kind: 'tracker',
  ref: `${trackerPath}#${entry.originalId.toLowerCase()}`,
});

const normalizeLegacyBody = (entry: LegacyBackpressureTechDebtEntry): string =>
  entry.body.replaceAll(staleBunMigrationRef, correctedBunMigrationRef);

const revisitTriggerFor = (spec: DispositionSpec): string => {
  if (spec.status === 'open') {
    return 'Revisit in backpressure when the original tracker condition above is ready for implementation.';
  }

  return `No further trigger remains; the migration disposition closed this legacy entry as ${spec.status}.`;
};

const bodyFor = (entry: LegacyBackpressureTechDebtEntry, spec: DispositionSpec): string => {
  const problem = normalizeLegacyBody(entry);

  return [
    `${entry.title}.`,
    '## Problem',
    problem,
    '## Why deferred',
    spec.rationale,
    '## Revisit trigger',
    revisitTriggerFor(spec),
  ].join('\n\n');
};

const uniqueTags = (tags: ReadonlyArray<string>): ReadonlyArray<string> =>
  Object.freeze([...new Set(tags)]);

const baseFrontmatter = (
  entry: LegacyBackpressureTechDebtEntry,
  spec: DispositionSpec,
  runtime: ImportRuntime,
): TechDebtFrontmatter => {
  const { context } = runtime;
  const recordId = renderRecordId({
    number: entry.number,
    repoKey: context.repoKey,
    typePrefix: 'TD',
  });

  return {
    schema_version: 1,
    id: recordId,
    repo_key: context.repoKey,
    record_type: 'tech-debt',
    number: entry.number,
    title: entry.title,
    status: spec.status,
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: context.defaultVisibility,
    created_at: runtime.importedAt,
    updated_at: runtime.importedAt,
    tags: uniqueTags([
      'record/tech-debt',
      `repo/${context.repoSlug}`,
      `status/${spec.status}`,
      `visibility/${context.defaultVisibility}`,
    ]),
    source: {
      discovered_at: runtime.importedAt,
      refs: [sourceRefFor(entry, runtime.trackerPath)],
    },
  };
};

const frontmatterFor = (
  entry: LegacyBackpressureTechDebtEntry,
  spec: DispositionSpec,
  runtime: ImportRuntime,
): TechDebtFrontmatter => {
  const frontmatter = baseFrontmatter(entry, spec, runtime);

  if (spec.status === 'open') {
    return frontmatter;
  }

  const resolution = {
    disposition: spec.status,
    resolved_at: runtime.resolvedAt,
    rationale: spec.rationale,
  };

  if (spec.evidenceRefs) {
    return {
      ...frontmatter,
      resolution: { ...resolution, evidence_refs: spec.evidenceRefs },
    };
  }

  return { ...frontmatter, resolution };
};

const specFor = (originalId: string): DispositionSpec => {
  const spec = dispositionSpecs[originalId];

  if (!spec) {
    throw new IntrospectionError(
      'backpressure_import.disposition_missing',
      'Backpressure tracker entry has no import disposition.',
      { originalId },
    );
  }

  return spec;
};

const importRecordFor = (
  entry: LegacyBackpressureTechDebtEntry,
  spec: DispositionSpec,
  runtime: ImportRuntime,
): BackpressureTechDebtImportedRecord => {
  const frontmatter = frontmatterFor(entry, spec, runtime);
  const relativePath = canonicalRecordRelativePath({
    id: frontmatter.id,
    recordTypeKey: frontmatter.record_type,
    status: frontmatter.status,
  });
  const reportRow = {
    disposition: spec.disposition,
    originalId: entry.originalId,
    rationale: spec.rationale,
    recordId: frontmatter.id,
    relativePath,
    status: frontmatter.status,
  };

  return {
    legacyEntry: entry,
    record: {
      frontmatter,
      body: bodyFor(entry, spec),
    },
    relativePath,
    reportRow,
  };
};

const parseBackpressureTechDebtTracker = (
  markdown: string,
): ReadonlyArray<LegacyBackpressureTechDebtEntry> => {
  const matches = [...markdown.matchAll(markdownHeadingPattern)];

  return matches.map((match, index) => {
    const originalId = match.groups?.['originalId'];
    const title = match.groups?.['title'];
    const number = Number.parseInt(originalId?.slice('TD-'.length) ?? '', 10);
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? markdown.length;
    const body = markdown
      .slice(bodyStart, bodyEnd)
      .replace(/^\r?\n+/u, '')
      .trim();

    if (!originalId || !title || !Number.isSafeInteger(number)) {
      throw new IntrospectionError(
        'backpressure_import.legacy_heading.invalid',
        'Backpressure tracker contains an invalid TD heading.',
        { heading: match[0] },
      );
    }

    return { body, number, originalId, title };
  });
};

const assertExpectedLegacyEntries = (
  entries: ReadonlyArray<LegacyBackpressureTechDebtEntry>,
): void => {
  const actualIds = entries.map((entry) => entry.originalId).sort();
  const unknownIds = actualIds.filter((id) => !(id in dispositionSpecs));
  const missingIds = expectedLegacyIds.filter((id) => !actualIds.includes(id));

  if (unknownIds.length > 0 || missingIds.length > 0) {
    throw new IntrospectionError(
      'backpressure_import.legacy_entries.mismatch',
      'Backpressure tracker entries do not match the importer disposition table.',
      { actualIds, expectedLegacyIds, missingIds, unknownIds },
    );
  }
};

const legacyGapIds = (
  entries: ReadonlyArray<LegacyBackpressureTechDebtEntry>,
): ReadonlyArray<string> => {
  const numbers = entries.map((entry) => entry.number);
  const present = new Set(numbers);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const gaps: Array<string> = [];

  for (let number = min; number <= max; number += 1) {
    if (!present.has(number)) {
      gaps.push(`TD-${String(number).padStart(legacyNumberWidth, '0')}`);
    }
  }

  return Object.freeze(gaps);
};

const nextNumberAfter = (records: ReadonlyArray<BackpressureTechDebtImportedRecord>): number =>
  Math.max(...records.map((record) => record.record.frontmatter.number)) + 1;

const buildBackpressureTechDebtImport = ({
  context,
  importedAt = defaultImportTimestamp,
  markdown,
  resolvedAt = defaultImportTimestamp,
  trackerPath = defaultTrackerPath,
}: BuildBackpressureTechDebtImportOptions): BackpressureTechDebtImportResult => {
  const entries = parseBackpressureTechDebtTracker(markdown);
  assertExpectedLegacyEntries(entries);

  const runtime = {
    context: normalizedContext(context),
    importedAt,
    resolvedAt,
    trackerPath,
  };
  const records = entries.map((entry) =>
    importRecordFor(entry, specFor(entry.originalId), runtime),
  );

  return {
    records,
    report: {
      legacyGapIds: legacyGapIds(entries),
      nextNumber: nextNumberAfter(records),
      rows: records.map((record) => record.reportRow),
    },
  };
};

const writeBackpressureTechDebtImport = async (
  options: WriteBackpressureTechDebtImportOptions,
): Promise<BackpressureTechDebtWriteResult> => {
  const result = buildBackpressureTechDebtImport(options);
  const storedRecords: Array<StoredMarkdownRecord> = [];

  for (const importedRecord of result.records) {
    storedRecords.push(
      await options.store.createRecord(importedRecord.relativePath, importedRecord.record),
    );
  }

  return { ...result, storedRecords };
};

const renderBackpressureTechDebtImportReport = (
  report: BackpressureTechDebtImportReport,
): string => {
  const header = '| Original ID | Record ID | Status | Disposition | Path |';
  const separator = '|---|---|---|---|---|';
  const rows = report.rows.map(
    (row) =>
      `| ${row.originalId} | ${row.recordId} | ${row.status} | ${row.disposition} | ${row.relativePath} |`,
  );

  return [header, separator, ...rows, ``, `Next number: ${report.nextNumber}`].join('\n');
};

export {
  buildBackpressureTechDebtImport,
  correctedBunMigrationRef,
  parseBackpressureTechDebtTracker,
  renderBackpressureTechDebtImportReport,
  staleBunMigrationRef,
  writeBackpressureTechDebtImport,
};
export type {
  BackpressureTechDebtImportDisposition,
  BackpressureTechDebtImportReport,
  BackpressureTechDebtImportReportRow,
  BackpressureTechDebtImportResult,
  BackpressureTechDebtImportStatus,
  BackpressureTechDebtImportedRecord,
  BackpressureTechDebtWriteResult,
  LegacyBackpressureTechDebtEntry,
};
