/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import type { RepoContext } from '../config/repo-context.js';
import { IntrospectionError } from '../core/errors.js';
import { buildRecordCandidate } from '../core/record-candidate.js';
import type {
  EvidenceRef,
  ParsedRecord,
  RecordType,
  Resolution,
  SourceBlock,
  ValidationContext,
} from '../core/record-type-types.js';
import { checkRecordResults } from '../core/validation.js';
import type { CheckFinding, RecordReadResult } from '../core/validation.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import type { MarkdownRecordStore } from '../store/markdown-record-store.js';

import { allocationBase, indexCorpus } from './corpus-index.js';
import type { CorpusIndex, OccupiedIdentity } from './corpus-index.js';
import type { ImportIdPolicy, ImportManifest, ImportManifestEntry } from './manifest.js';

interface ImportCandidate {
  readonly entry: ImportManifestEntry;
  readonly record: ParsedRecord;
  readonly relativePath: string;
  readonly recordId: string;
  readonly number: number;
}

interface ImportEntryReport {
  readonly recordId: string;
  readonly number: number;
  readonly status: string;
  readonly relativePath: string;
  readonly legacyId?: string;
  readonly findings: ReadonlyArray<CheckFinding>;
}

interface ImportReport {
  readonly ok: boolean;
  readonly written: boolean;
  readonly recordType: string;
  readonly idPolicy: ImportIdPolicy;
  readonly entries: ReadonlyArray<ImportEntryReport>;
}

interface CandidateBuildContext {
  readonly manifest: ImportManifest;
  readonly recordType: RecordType;
  readonly repo: RepoContext;
  readonly validationContext: ValidationContext;
  readonly importedAt: string;
}

interface RunImportOptions {
  readonly manifest: ImportManifest;
  readonly repo: RepoContext;
  readonly validationContext: ValidationContext;
  readonly store: MarkdownRecordStore;
  readonly importedAt: string;
  readonly dryRun: boolean;
}

interface PreflightOptions {
  readonly candidates: ReadonlyArray<ImportCandidate>;
  readonly corpus: CorpusIndex;
  readonly store: MarkdownRecordStore;
  readonly validationContext: ValidationContext;
}

interface EntryReportInput {
  readonly candidate: ImportCandidate;
  readonly validationFindings: ReadonlyArray<CheckFinding>;
  readonly pathFinding: CheckFinding | null;
  readonly occupied: OccupiedIdentity | null;
}

const errorText = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const resolveRecordType = (recordType: string): RecordType => {
  const resolved = recordTypeRegistry.get(recordType);

  if (!resolved) {
    throw new IntrospectionError(
      'import.record_type.unknown',
      `Record type "${recordType}" is not registered.`,
      { recordType, allowed: recordTypeRegistry.keys() },
    );
  }

  return resolved;
};

const preservedNumbers = (manifest: ImportManifest): ReadonlyArray<number> =>
  manifest.entries.map((entry, index) => {
    if (typeof entry.number !== 'number') {
      throw new IntrospectionError(
        'import.entry.number_required',
        'Entry needs a number under id_policy=preserve.',
        { index, legacyId: entry.legacy_id },
      );
    }

    return entry.number;
  });

const allocatedNumbers = (
  manifest: ImportManifest,
  corpus: CorpusIndex,
  repo: RepoContext,
  recordType: RecordType,
): ReadonlyArray<number> => {
  const base = allocationBase(corpus, repo, recordType);

  return manifest.entries.map((entry, index) => {
    if (typeof entry.number === 'number') {
      throw new IntrospectionError(
        'import.entry.number_forbidden',
        'Entry must not set a number under id_policy=allocate.',
        { index, legacyId: entry.legacy_id },
      );
    }

    return base + index;
  });
};

const candidateNumbers = (
  manifest: ImportManifest,
  corpus: CorpusIndex,
  repo: RepoContext,
  recordType: RecordType,
): ReadonlyArray<number> => {
  if (manifest.id_policy === 'preserve') {
    return preservedNumbers(manifest);
  }

  return allocatedNumbers(manifest, corpus, repo, recordType);
};

/*
 * Sections are rendered verbatim so validation — not the importer — enforces which
 * headings a record type requires; the agent who authored the manifest owns the prose.
 */
const renderBody = (entry: ImportManifestEntry): string =>
  `${entry.sections.map((section) => `${section.heading}\n\n${section.body}`).join('\n\n')}\n`;

const trackerRef = (manifest: ImportManifest, entry: ImportManifestEntry): EvidenceRef | null => {
  const trackerPath = manifest.source?.tracker_path;

  if (!trackerPath || !entry.legacy_id) {
    return null;
  }

  return { kind: 'tracker', ref: `${trackerPath}#${entry.legacy_id.toLowerCase()}` };
};

const buildSource = (
  manifest: ImportManifest,
  entry: ImportManifestEntry,
  importedAt: string,
): SourceBlock => {
  const discoveredAt = manifest.source?.discovered_at ?? importedAt;
  const refs = [trackerRef(manifest, entry), ...(entry.source_refs ?? [])].filter(
    (ref): ref is EvidenceRef => ref !== null,
  );

  if (refs.length > 0) {
    return { discovered_at: discoveredAt, refs };
  }

  return { discovered_at: discoveredAt };
};

/*
 * Resolution disposition is always the entry status: the lifecycle requires them equal, so
 * disposition is derived rather than authored as a separate (redundant) manifest field.
 */
const buildResolution = (
  entry: ImportManifestEntry,
  importedAt: string,
): Resolution | undefined => {
  if (!entry.resolution) {
    return;
  }

  const resolution: Resolution = {
    disposition: entry.status,
    resolved_at: entry.resolution.resolved_at ?? importedAt,
    rationale: entry.resolution.rationale,
  };

  if (entry.resolution.evidence_refs) {
    return { ...resolution, evidence_refs: entry.resolution.evidence_refs };
  }

  return resolution;
};

const buildCandidate = (
  entry: ImportManifestEntry,
  recordNumber: number,
  context: CandidateBuildContext,
): ImportCandidate => {
  const { recordType, repo, validationContext, importedAt } = context;
  const body = renderBody(entry);
  const resolution = buildResolution(entry, importedAt);
  // Delegate candidate assembly to the shared core builder; import-specific
  // Source, body, and resolution inputs are fully constructed before passing in.
  // Resolution is spread conditionally: exactOptionalPropertyTypes forbids
  // Sending Resolution | undefined to an optional Resolution property.
  const candidate = buildRecordCandidate({
    recordType,
    repoKey: repo.repoKey,
    number: recordNumber,
    status: entry.status,
    title: entry.title,
    visibility: repo.defaultVisibility,
    createdAt: importedAt,
    body,
    source: buildSource(context.manifest, entry, importedAt),
    ...(resolution && { resolution }),
    userTags: entry.tags ?? [],
    validationContext,
  });

  return {
    entry,
    // Attach path so validation error reporting (recordReportPath) can locate the record.
    record: { ...candidate.record, path: candidate.identity.relativePath },
    relativePath: candidate.identity.relativePath,
    recordId: candidate.identity.id,
    number: candidate.identity.number,
  };
};

const buildCandidates = (
  buildContext: CandidateBuildContext,
  corpus: CorpusIndex,
): ReadonlyArray<ImportCandidate> => {
  const { manifest, recordType, repo } = buildContext;
  const numbers = candidateNumbers(manifest, corpus, repo, recordType);

  return manifest.entries.map((entry, index) =>
    buildCandidate(entry, numbers[index] ?? 0, buildContext),
  );
};

const duplicateIdOf = (finding: CheckFinding): string | undefined => {
  if (finding.code !== 'id.duplicate') {
    return;
  }

  const duplicated = finding.path?.[1];

  if (typeof duplicated === 'string') {
    return duplicated;
  }

  return;
};

/*
 * Attribute a finding to a candidate when it is the candidate's own per-record finding, or
 * an id-collision finding naming the candidate's ID. Pure-corpus findings (read failures,
 * vocabulary integrity, collisions among pre-existing records) are excluded so a dirty
 * corpus never blocks an otherwise-valid import.
 */
const findingsForRecordId = (
  findings: ReadonlyArray<CheckFinding>,
  recordId: string,
): ReadonlyArray<CheckFinding> =>
  findings.filter(
    (finding) =>
      (finding.source === 'record' && finding.recordId === recordId) ||
      duplicateIdOf(finding) === recordId,
  );

const pathCollisionFinding = (candidate: ImportCandidate): CheckFinding => ({
  code: 'import.path.exists',
  severity: 'error',
  message: `Target path ${candidate.relativePath} already exists, so the import was refused before any write.`,
  remediation:
    'Remove or relocate the existing file, or change the manifest id_policy, then re-run import.',
  source: 'record',
  recordId: candidate.recordId,
  recordPath: candidate.relativePath,
});

const pathProbeErrorFinding = (candidate: ImportCandidate, error: unknown): CheckFinding => ({
  code: 'import.path.probe_failed',
  severity: 'error',
  message: `Could not check whether target path ${candidate.relativePath} exists: ${errorText(error)}.`,
  remediation:
    'Resolve the filesystem error (for example a permissions problem) on the records root, then re-run import.',
  source: 'record',
  recordId: candidate.recordId,
  recordPath: candidate.relativePath,
});

/*
 * A stray file at a target path is not a parseable record, so duplicateRecordIdFindings
 * cannot see it; this on-disk probe fails the import before the first write instead of
 * partially applying. Only ENOENT means the path is free — any other access error (e.g. a
 * permissions problem) becomes a finding so preflight fails loudly rather than mid-write.
 */
const pathProbeFinding = async (
  store: MarkdownRecordStore,
  candidate: ImportCandidate,
): Promise<CheckFinding | null> => {
  try {
    const exists = await store.pathExists(candidate.relativePath);

    if (exists) {
      return pathCollisionFinding(candidate);
    }

    return null;
  } catch (error) {
    return pathProbeErrorFinding(candidate, error);
  }
};

const occupiedIdFinding = (
  candidate: ImportCandidate,
  occupied: OccupiedIdentity | null,
): CheckFinding | null => {
  if (!occupied) {
    return null;
  }

  return {
    code: 'id.duplicate',
    severity: 'error',
    message: `Record ID "${candidate.recordId}" is already owned by an existing record at ${occupied.relativePath} that could not be parsed.`,
    path: ['id', candidate.recordId],
    remediation:
      'Repair or remove the existing record, or choose a different number, before importing.',
    source: 'record',
    recordId: candidate.recordId,
    recordPath: candidate.relativePath,
  };
};

const buildEntryReport = (input: EntryReportInput): ImportEntryReport => {
  const { candidate, validationFindings, pathFinding, occupied } = input;
  const extraFindings = [pathFinding, occupiedIdFinding(candidate, occupied)].filter(
    (finding): finding is CheckFinding => finding !== null,
  );
  const findings = [
    ...findingsForRecordId(validationFindings, candidate.recordId),
    ...extraFindings,
  ];

  return {
    recordId: candidate.recordId,
    number: candidate.number,
    status: candidate.entry.status,
    relativePath: candidate.relativePath,
    ...(candidate.entry.legacy_id && { legacyId: candidate.entry.legacy_id }),
    findings,
  };
};

/*
 * Preflight runs the public checkRecordResults over the candidates combined with the
 * existing on-disk corpus (store.listRecordResults), rather than writing candidates to a
 * temp dir and running checkRecords: it uses only already-public APIs (the single-candidate
 * form is what `record create` uses), needs no temp-dir I/O, and — because
 * duplicateRecordIdFindings runs across corpus + candidates — catches ID collisions with
 * existing readable records. Collisions with unreadable records (whose IDs the parser cannot
 * see) and on-disk path occupancy are layered on per candidate below.
 */
const preflight = async (options: PreflightOptions): Promise<ReadonlyArray<ImportEntryReport>> => {
  const { candidates, corpus, store, validationContext } = options;
  const combined: Array<RecordReadResult> = [
    ...corpus.results,
    ...candidates.map((candidate): RecordReadResult => ({ ok: true, record: candidate.record })),
  ];
  const validationFindings = checkRecordResults(
    combined,
    recordTypeRegistry,
    validationContext,
  ).findings;
  const pathFindings = await Promise.all(
    candidates.map(async (candidate) => pathProbeFinding(store, candidate)),
  );

  return candidates.map((candidate, index) =>
    buildEntryReport({
      candidate,
      validationFindings,
      pathFinding: pathFindings[index] ?? null,
      occupied: corpus.occupiedById.get(candidate.recordId) ?? null,
    }),
  );
};

const reportHasNoErrors = (entries: ReadonlyArray<ImportEntryReport>): boolean =>
  entries.every((entry) => entry.findings.every((finding) => finding.severity !== 'error'));

const removeNewlyCreated = async (
  store: MarkdownRecordStore,
  createdPaths: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> => {
  const cleanupFailures: Array<string> = [];

  for (const relativePath of createdPaths) {
    try {
      await store.deleteRecord(relativePath);
    } catch (error) {
      cleanupFailures.push(`${relativePath}: ${errorText(error)}`);
    }
  }

  return cleanupFailures;
};

/*
 * Roll back only the records THIS import created, tracked after a successful createRecord
 * return. A createRecord that throws on no-clobber means the target pre-existed — it is not
 * ours, so deleting it would destroy another writer's file (a race-safe failure must never
 * become data loss). The store closes the write-succeeds-then-readback-throws window itself,
 * so there is no orphan left for this layer to track.
 */
const writeCandidates = async (
  store: MarkdownRecordStore,
  candidates: ReadonlyArray<ImportCandidate>,
  shouldWrite: boolean,
): Promise<void> => {
  if (!shouldWrite) {
    return;
  }

  const created: Array<string> = [];

  try {
    for (const candidate of candidates) {
      await store.createRecord(candidate.relativePath, candidate.record);
      created.push(candidate.relativePath);
    }
  } catch (error) {
    const cleanupFailures = await removeNewlyCreated(store, created);

    throw new IntrospectionError(
      'import.write_failed',
      'Record write failed; rolled back the records this import created.',
      { created, cleanupFailures, cause: errorText(error) },
    );
  }
};

const runImport = async (options: RunImportOptions): Promise<ImportReport> => {
  const { manifest, repo, validationContext, store, importedAt, dryRun } = options;
  const recordType = resolveRecordType(manifest.record_type);
  const corpus = indexCorpus(await store.listRecordResults(), repo, recordType);
  const buildContext: CandidateBuildContext = {
    importedAt,
    manifest,
    recordType,
    repo,
    validationContext,
  };
  const candidates = buildCandidates(buildContext, corpus);
  const entries = await preflight({ candidates, corpus, store, validationContext });
  const ok = reportHasNoErrors(entries);
  const written = ok && !dryRun;
  await writeCandidates(store, candidates, written);

  return { ok, written, recordType: recordType.key, idPolicy: manifest.id_policy, entries };
};

export { runImport };
export type { ImportCandidate, ImportEntryReport, ImportReport };
