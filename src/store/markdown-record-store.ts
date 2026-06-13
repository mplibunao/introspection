import { access, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { IntrospectionError, RecordStoreError } from '../core/errors.js';
import type { ParsedRecord } from '../core/record-type-types.js';

import {
  assertExistingRecordInsideRoot,
  assertParentRealPathInsideRoot,
  createFileNoClobber,
  createPathResolver,
  hashRawBytes,
  isMissingFileError,
  moveFileNoClobber,
  rootExists,
  updateFileAtomically,
} from './file-system.js';
import { parseMarkdownRecord, renderMarkdownRecord } from './frontmatter.js';

interface StoredMarkdownRecord extends ParsedRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly rawBytes: Buffer;
  readonly hash: string;
}

interface MarkdownRecordReadSuccess {
  readonly ok: true;
  readonly record: StoredMarkdownRecord;
}

interface MarkdownRecordReadFailure {
  readonly ok: false;
  readonly inputPath: string;
  readonly code: string;
  readonly message: string;
  readonly relativePath?: string;
}

type MarkdownRecordReadResult = MarkdownRecordReadFailure | MarkdownRecordReadSuccess;

interface MarkdownRecordStoreOptions {
  readonly root: string;
  readonly archiveDirectoryName?: string;
}

type MarkdownRecordUpdate = ParsedRecord | ((record: StoredMarkdownRecord) => ParsedRecord);

interface ArchiveRecordOptions {
  readonly targetRelativePath?: string;
}

interface ResolvedRecordPath {
  readonly absolutePath: string;
  readonly relativePath: string;
}

type PathResolver = (recordPath: string) => ResolvedRecordPath;

interface MarkdownRecordStoreRuntime {
  readonly archiveDirectoryName: string;
  readonly resolvePath: PathResolver;
  readonly root: string;
}

interface MarkdownRecordStore {
  readonly root: string;
  listRecordResults: () => Promise<ReadonlyArray<MarkdownRecordReadResult>>;
  listRecords: () => Promise<ReadonlyArray<StoredMarkdownRecord>>;
  readRecord: (recordPath: string) => Promise<StoredMarkdownRecord>;
  readRecordResult: (recordPath: string) => Promise<MarkdownRecordReadResult>;
  createRecord: (relativePath: string, record: ParsedRecord) => Promise<StoredMarkdownRecord>;
  pathExists: (recordPath: string) => Promise<boolean>;
  deleteRecord: (recordPath: string) => Promise<void>;
  updateRecord: (
    record: StoredMarkdownRecord,
    update: MarkdownRecordUpdate,
  ) => Promise<StoredMarkdownRecord>;
  moveRecord: (
    record: StoredMarkdownRecord,
    targetRelativePath: string,
  ) => Promise<StoredMarkdownRecord>;
  archiveRecord: (
    record: StoredMarkdownRecord,
    options?: ArchiveRecordOptions,
  ) => Promise<StoredMarkdownRecord>;
}

const markdownExtension = '.md';
const defaultArchiveDirectoryName = 'archive';

const nativeErrorCode = (error: unknown): string | null => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;

    if (typeof code === 'string') {
      return code;
    }
  }

  return null;
};

const errorCode = (error: unknown): string => {
  if (error instanceof IntrospectionError) {
    return error.code;
  }

  if (nativeErrorCode(error)) {
    return 'record_store.fs_error';
  }

  return 'record_store.unknown_error';
};

const errorMessage = (error: unknown): string => {
  const code = nativeErrorCode(error);

  if (error instanceof Error && code) {
    return `${code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown record store error.';
};

const createReadFailure = (
  inputPath: string,
  error: unknown,
  relativePath?: string,
): MarkdownRecordReadFailure => {
  const failure = {
    ok: false,
    inputPath,
    code: errorCode(error),
    message: errorMessage(error),
  } as const;

  if (typeof relativePath === 'string') {
    return { ...failure, relativePath };
  }

  return failure;
};

const collectMarkdownFiles = async (
  root: string,
  directory: string,
): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectMarkdownFiles(root, entryPath);
      }

      if (entry.isFile() && path.extname(entry.name) === markdownExtension) {
        return [path.relative(root, entryPath)];
      }

      return [];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
};

const readStoredRecordAtPath = async (
  root: string,
  recordPath: ResolvedRecordPath,
): Promise<StoredMarkdownRecord> => {
  await assertExistingRecordInsideRoot(root, recordPath.absolutePath);

  const rawBytes = await readFile(recordPath.absolutePath);
  const parsed = parseMarkdownRecord(rawBytes.toString('utf8'), recordPath.absolutePath);

  return {
    ...parsed,
    absolutePath: recordPath.absolutePath,
    relativePath: recordPath.relativePath,
    rawBytes,
    hash: hashRawBytes(rawBytes),
  };
};

const readRecordResult = async (
  root: string,
  resolvePath: PathResolver,
  recordPath: string,
): Promise<MarkdownRecordReadResult> => {
  let resolvedPath: ResolvedRecordPath | null = null;

  try {
    resolvedPath = resolvePath(recordPath);
    const record = await readStoredRecordAtPath(root, resolvedPath);

    return { ok: true, record };
  } catch (error) {
    if (resolvedPath) {
      return createReadFailure(recordPath, error, resolvedPath.relativePath);
    }

    return createReadFailure(recordPath, error);
  }
};

const resolveUpdate = (
  record: StoredMarkdownRecord,
  update: MarkdownRecordUpdate,
): ParsedRecord => {
  if (typeof update === 'function') {
    return update(record);
  }

  return update;
};

const archivePathFor = (
  record: StoredMarkdownRecord,
  archiveDirectoryName: string,
  targetRelativePath?: string,
): string => {
  if (targetRelativePath) {
    return targetRelativePath;
  }

  return path.join(
    record.frontmatter.record_type,
    archiveDirectoryName,
    path.basename(record.relativePath),
  );
};

const listRecordResults = async (
  root: string,
  resolvePath: PathResolver,
): Promise<ReadonlyArray<MarkdownRecordReadResult>> => {
  if (!(await rootExists(root))) {
    return [];
  }

  const relativePaths = await collectMarkdownFiles(root, root);

  return Promise.all(
    relativePaths.map(async (relativePath) => readRecordResult(root, resolvePath, relativePath)),
  );
};

const listRecords = async (
  root: string,
  resolvePath: PathResolver,
): Promise<ReadonlyArray<StoredMarkdownRecord>> => {
  const results = await listRecordResults(root, resolvePath);
  const failures = results.filter((result): result is MarkdownRecordReadFailure => !result.ok);

  if (failures.length > 0) {
    throw new RecordStoreError(
      'record_store.list_failed',
      'One or more records could not be read.',
      {
        failures,
      },
    );
  }

  return results
    .filter((result): result is MarkdownRecordReadSuccess => result.ok)
    .map((result) => result.record);
};

const readRecord = async (
  root: string,
  resolvePath: PathResolver,
  recordPath: string,
): Promise<StoredMarkdownRecord> => readStoredRecordAtPath(root, resolvePath(recordPath));

/*
 * A successful createFileNoClobber means THIS call created the target, so if the readback
 * then fails we delete our own file before rethrowing — a failed create must not leave an
 * orphan. Cleanup is best-effort so the original readback error is what surfaces.
 */
const removeCreatedFile = async (absolutePath: string): Promise<void> => {
  try {
    await rm(absolutePath, { force: true });
  } catch {
    // Best-effort: surface the original readback failure, not a cleanup error.
  }
};

const createRecord = async (
  root: string,
  resolvePath: PathResolver,
  relativePath: string,
  record: ParsedRecord,
): Promise<StoredMarkdownRecord> => {
  const recordPath = resolvePath(relativePath);
  await createFileNoClobber(root, recordPath.absolutePath, renderMarkdownRecord(record));

  try {
    return await readStoredRecordAtPath(root, recordPath);
  } catch (error) {
    await removeCreatedFile(recordPath.absolutePath);

    throw error;
  }
};

/*
 * Root-safe existence probe: resolvePath rejects any target that escapes the records root
 * (so an untrusted, manifest-supplied status segment cannot make callers probe outside it),
 * and only ENOENT is treated as absent — other access errors surface to the caller.
 */
const recordPathExists = async (
  root: string,
  resolvePath: PathResolver,
  recordPath: string,
): Promise<boolean> => {
  const { absolutePath } = resolvePath(recordPath);
  /*
   * Realpath-check the parent like the write path does, so a symlinked segment cannot make
   * this probe follow a path outside the records root.
   */
  await assertParentRealPathInsideRoot(root, absolutePath);

  try {
    await access(absolutePath);

    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
};

/*
 * Root-safe best-effort delete used for import rollback; force ignores an absent target. The
 * realpath parent check matters most here because rm is destructive, so it must never follow
 * a symlinked segment out of the records root.
 */
const deleteRecordFile = async (
  root: string,
  resolvePath: PathResolver,
  recordPath: string,
): Promise<void> => {
  const { absolutePath } = resolvePath(recordPath);
  await assertParentRealPathInsideRoot(root, absolutePath);
  await rm(absolutePath, { force: true });
};

const updateRecord = async (
  root: string,
  record: StoredMarkdownRecord,
  update: MarkdownRecordUpdate,
): Promise<StoredMarkdownRecord> => {
  const nextRecord = resolveUpdate(record, update);
  await updateFileAtomically(
    root,
    record.absolutePath,
    renderMarkdownRecord(nextRecord),
    record.hash,
  );

  return readStoredRecordAtPath(root, {
    absolutePath: record.absolutePath,
    relativePath: record.relativePath,
  });
};

const moveRecord = async (
  root: string,
  resolvePath: PathResolver,
  record: StoredMarkdownRecord,
  targetRelativePath: string,
): Promise<StoredMarkdownRecord> => {
  const targetPath = resolvePath(targetRelativePath);
  await moveFileNoClobber(root, record.absolutePath, targetPath.absolutePath, record.hash);

  return readStoredRecordAtPath(root, targetPath);
};

const archiveRecord = async (
  runtime: MarkdownRecordStoreRuntime,
  record: StoredMarkdownRecord,
  options?: ArchiveRecordOptions,
): Promise<StoredMarkdownRecord> => {
  const targetRelativePath = archivePathFor(
    record,
    runtime.archiveDirectoryName,
    options?.targetRelativePath,
  );

  return moveRecord(runtime.root, runtime.resolvePath, record, targetRelativePath);
};

const createMarkdownRecordStore = (options: MarkdownRecordStoreOptions): MarkdownRecordStore => {
  const root = path.resolve(options.root);
  const archiveDirectoryName = options.archiveDirectoryName ?? defaultArchiveDirectoryName;
  const resolvePath = createPathResolver(root);
  const runtime = { archiveDirectoryName, resolvePath, root };

  return {
    root,
    listRecordResults: async () => listRecordResults(root, resolvePath),
    listRecords: async () => listRecords(root, resolvePath),
    readRecord: async (recordPath) => readRecord(root, resolvePath, recordPath),
    readRecordResult: async (recordPath) => readRecordResult(root, resolvePath, recordPath),
    createRecord: async (relativePath, record) =>
      createRecord(root, resolvePath, relativePath, record),
    pathExists: async (recordPath) => recordPathExists(root, resolvePath, recordPath),
    deleteRecord: async (recordPath) => deleteRecordFile(root, resolvePath, recordPath),
    updateRecord: async (record, update) => updateRecord(root, record, update),
    moveRecord: async (record, targetRelativePath) =>
      moveRecord(root, resolvePath, record, targetRelativePath),
    archiveRecord: async (record, archiveOptions) => archiveRecord(runtime, record, archiveOptions),
  };
};

export { createMarkdownRecordStore, hashRawBytes };
export type {
  ArchiveRecordOptions,
  MarkdownRecordReadFailure,
  MarkdownRecordReadResult,
  MarkdownRecordReadSuccess,
  MarkdownRecordStore,
  MarkdownRecordStoreOptions,
  MarkdownRecordUpdate,
  StoredMarkdownRecord,
};
