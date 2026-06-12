/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { access, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { IntrospectionError } from '../core/errors.js';
import type { RepoContext } from '../config/repo-context.js';
import type { RecordTypeRegistry, ValidationContext } from '../core/record-type.js';
import type { MarkdownRecordStore } from '../store/markdown-record-store.js';
import { packageVersion } from '../version.js';

import { buildExportDocuments, buildExportManifest } from './export-document.js';
import type {
  ExportManifest,
  ExportManifestEntry,
  ExportRecordDocument,
} from './export-document.js';
import { writeGnoProjection } from './gno-exporter.js';
import { stableJson, writeJsonExport } from './json-exporter.js';

interface ExportServiceOptions {
  readonly destinationDirectory?: string;
  readonly generatedAt: Date;
  readonly registry: RecordTypeRegistry;
  readonly repo: RepoContext;
  readonly store: MarkdownRecordStore;
  readonly validationContext: ValidationContext;
}

interface ExportServiceResult {
  readonly destinationDirectory: string;
  readonly manifest: ExportManifest;
  readonly manifestPath: string;
  readonly recordsExported: number;
}

type ExportFormat = 'all' | 'gno' | 'json';

const generatedDirectoryName = 'generated';
const jsonExportFileName = 'records.json';
const manifestFileName = 'manifest.json';
const gnoProjectionDirectoryName = 'gno-markdown';

const defaultDestinationDirectory = (repo: RepoContext): string =>
  path.join(repo.introspectionRoot, generatedDirectoryName);

const isMissingPathError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath);

    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

const relativePathIsInsideOrEqualRoot = (relativePath: string): boolean =>
  relativePath.length === 0 ||
  (!relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath));

const nearestExistingAncestor = async (absolutePath: string): Promise<string> => {
  let candidatePath = absolutePath;

  while (!(await pathExists(candidatePath))) {
    const parent = path.dirname(candidatePath);

    if (parent === candidatePath) {
      return candidatePath;
    }

    candidatePath = parent;
  }

  return candidatePath;
};

const defaultDestinationEscapesRepoError = (
  repoRoot: string,
  destinationDirectory: string,
  existingAncestor: string,
  existingAncestorRealPath: string,
): IntrospectionError =>
  new IntrospectionError(
    'export.default_destination.path_outside_repo_root',
    'Default export destination must resolve inside the repo root.',
    { destinationDirectory, existingAncestor, existingAncestorRealPath, repoRoot },
  );

const recordsRootInsideDefaultDestinationError = (
  recordsRoot: string,
  destinationDirectory: string,
): IntrospectionError =>
  new IntrospectionError(
    'export.default_destination.records_root_inside_generated',
    'Default export would delete the configured records root.',
    { destinationDirectory, recordsRoot },
  );

const assertDefaultDestinationInsideRepo = async (
  repo: RepoContext,
  destinationDirectory: string,
): Promise<void> => {
  const repoRootRealPath = await realpath(repo.repoRoot);
  const existingAncestor = await nearestExistingAncestor(destinationDirectory);
  const existingAncestorRealPath = await realpath(existingAncestor);
  const relativeRealPath = path.relative(repoRootRealPath, existingAncestorRealPath);

  if (!relativePathIsInsideOrEqualRoot(relativeRealPath)) {
    throw defaultDestinationEscapesRepoError(
      repo.repoRoot,
      destinationDirectory,
      existingAncestor,
      existingAncestorRealPath,
    );
  }
};

const intendedRealPath = async (absolutePath: string): Promise<string> => {
  const existingAncestor = await nearestExistingAncestor(absolutePath);
  const existingAncestorRealPath = await realpath(existingAncestor);
  const relativeSuffix = path.relative(existingAncestor, absolutePath);

  return path.resolve(existingAncestorRealPath, relativeSuffix);
};

const recordsRootIsInsideDefaultDestination = async (
  recordsRoot: string,
  destinationDirectory: string,
): Promise<boolean> => {
  const relativeRecordsRoot = path.relative(destinationDirectory, recordsRoot);

  if (relativePathIsInsideOrEqualRoot(relativeRecordsRoot)) {
    return true;
  }

  if (!(await pathExists(recordsRoot))) {
    return false;
  }

  const recordsRootRealPath = await realpath(recordsRoot);
  const destinationRealPath = await intendedRealPath(destinationDirectory);
  const relativeRealRecordsRoot = path.relative(destinationRealPath, recordsRootRealPath);

  return relativePathIsInsideOrEqualRoot(relativeRealRecordsRoot);
};

const assertRecordsRootOutsideDefaultDestination = async (
  repo: RepoContext,
  destinationDirectory: string,
): Promise<void> => {
  if (await recordsRootIsInsideDefaultDestination(repo.recordsRoot, destinationDirectory)) {
    throw recordsRootInsideDefaultDestinationError(repo.recordsRoot, destinationDirectory);
  }
};

const prepareDefaultDestinationDirectory = async (repo: RepoContext): Promise<string> => {
  const destinationDirectory = defaultDestinationDirectory(repo);
  await assertDefaultDestinationInsideRepo(repo, destinationDirectory);
  await assertRecordsRootOutsideDefaultDestination(repo, destinationDirectory);
  // The generated tree is disposable and symlink-untrusted. Removing the root path itself unlinks a symlink instead of following it, then recreates a clean in-repo directory for artifact writes.
  await rm(destinationDirectory, { force: true, recursive: true });
  await mkdir(destinationDirectory, { recursive: true });

  return destinationDirectory;
};

const resolveDestinationDirectory = async (options: ExportServiceOptions): Promise<string> => {
  if (options.destinationDirectory) {
    return path.resolve(options.destinationDirectory);
  }

  return prepareDefaultDestinationDirectory(options.repo);
};

const relativeExportPath = (destinationDirectory: string, absolutePath: string): string =>
  path.relative(destinationDirectory, absolutePath) || path.basename(absolutePath);

const writeManifest = async (
  destinationDirectory: string,
  manifest: ExportManifest,
): Promise<string> => {
  const manifestPath = path.join(destinationDirectory, manifestFileName);
  await mkdir(destinationDirectory, { recursive: true });
  await writeFile(manifestPath, stableJson(manifest), 'utf8');

  return manifestPath;
};

const jsonEntry = (destinationDirectory: string, recordCount: number): ExportManifestEntry => ({
  kind: 'json',
  path: relativeExportPath(
    destinationDirectory,
    path.join(destinationDirectory, jsonExportFileName),
  ),
  record_count: recordCount,
});

const gnoEntry = (
  destinationDirectory: string,
  outputPath: string,
  recordCount: number,
  contentHash: string,
): ExportManifestEntry => ({
  kind: 'gno-markdown',
  path: relativeExportPath(destinationDirectory, outputPath),
  record_count: recordCount,
  sha256: contentHash,
});

const requestedFormats = (format: ExportFormat): ReadonlySet<ExportFormat> => {
  if (format === 'all') {
    return new Set(['json', 'gno']);
  }

  return new Set([format]);
};

const exportRecords = async (
  options: ExportServiceOptions,
): Promise<ReadonlyArray<ExportRecordDocument>> =>
  buildExportDocuments({
    context: options.validationContext,
    records: await options.store.listRecords(),
    registry: options.registry,
  });

const writeGnoEntry = async (
  destinationDirectory: string,
  records: ReadonlyArray<ExportRecordDocument>,
): Promise<ExportManifestEntry> => {
  const result = await writeGnoProjection({
    outputDirectory: path.join(destinationDirectory, gnoProjectionDirectoryName),
    records,
  });

  return gnoEntry(destinationDirectory, result.path, result.recordCount, result.sha256);
};

const buildEntries = async (
  formats: ReadonlySet<ExportFormat>,
  destinationDirectory: string,
  records: ReadonlyArray<ExportRecordDocument>,
): Promise<ReadonlyArray<ExportManifestEntry>> => {
  const entries: Array<ExportManifestEntry> = [];

  if (formats.has('json')) {
    entries.push(jsonEntry(destinationDirectory, records.length));
  }

  if (formats.has('gno')) {
    entries.push(await writeGnoEntry(destinationDirectory, records));
  }

  return entries;
};

const writeJsonBundle = async (
  destinationDirectory: string,
  manifest: ExportManifest,
  records: ReadonlyArray<ExportRecordDocument>,
): Promise<void> => {
  await writeJsonExport({
    manifest,
    outputPath: path.join(destinationDirectory, jsonExportFileName),
    records,
  });
};

const writeResult = async (
  destinationDirectory: string,
  manifest: ExportManifest,
  records: ReadonlyArray<ExportRecordDocument>,
  formats: ReadonlySet<ExportFormat>,
): Promise<ExportServiceResult> => {
  const manifestPath = await writeManifest(destinationDirectory, manifest);

  if (formats.has('json')) {
    await writeJsonBundle(destinationDirectory, manifest, records);
  }

  return { destinationDirectory, manifest, manifestPath, recordsExported: records.length };
};

const writeExports = async (
  format: ExportFormat,
  options: ExportServiceOptions,
): Promise<ExportServiceResult> => {
  const destinationDirectory = await resolveDestinationDirectory(options);
  const formats = requestedFormats(format);
  const records = await exportRecords(options);
  await mkdir(destinationDirectory, { recursive: true });
  const entries = await buildEntries(formats, destinationDirectory, records);
  const manifest = buildExportManifest({
    entries,
    generatedAt: options.generatedAt,
    repo: options.repo,
    version: packageVersion,
  });

  return writeResult(destinationDirectory, manifest, records, formats);
};

export { defaultDestinationDirectory, writeExports };
export type { ExportFormat, ExportServiceOptions, ExportServiceResult };
