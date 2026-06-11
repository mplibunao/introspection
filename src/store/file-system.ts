import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  link,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { RecordStoreError, StaleRecordError } from '../core/errors.js';

interface ResolvedRecordPath {
  readonly absolutePath: string;
  readonly relativePath: string;
}

type PathResolver = (recordPath: string) => ResolvedRecordPath;

const hashRawBytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const isErrorWithCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;

const isMissingFileError = (error: unknown): boolean => isErrorWithCode(error, 'ENOENT');
const isFileExistsError = (error: unknown): boolean => isErrorWithCode(error, 'EEXIST');

const pathIsInsideOrEqualRoot = (relativePath: string): boolean =>
  relativePath.length === 0 ||
  (!relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath));

const assertInsideRoot = (root: string, absolutePath: string): string => {
  const relativePath = path.relative(root, absolutePath);

  if (relativePath.length === 0 || !pathIsInsideOrEqualRoot(relativePath)) {
    throw new RecordStoreError(
      'record_store.path_outside_root',
      'Record path is outside the records root.',
      { path: absolutePath, root },
    );
  }

  return relativePath;
};

const assertInsideOrEqualRoot = (root: string, absolutePath: string): string => {
  const relativePath = path.relative(root, absolutePath);

  if (!pathIsInsideOrEqualRoot(relativePath)) {
    throw new RecordStoreError(
      'record_store.path_outside_root',
      'Record path is outside the records root.',
      { path: absolutePath, root },
    );
  }

  return relativePath;
};

const resolveRecordPath = (root: string, recordPath: string): ResolvedRecordPath => {
  if (path.isAbsolute(recordPath)) {
    const absolutePath = path.resolve(recordPath);

    return { absolutePath, relativePath: assertInsideRoot(root, absolutePath) };
  }

  const absolutePath = path.resolve(root, recordPath);

  return { absolutePath, relativePath: assertInsideRoot(root, absolutePath) };
};

const createPathResolver = (root: string): PathResolver => {
  const resolvedRoot = path.resolve(root);

  return (recordPath) => resolveRecordPath(resolvedRoot, recordPath);
};

const realPathIsInsideRoot = (rootRealPath: string, candidateRealPath: string): boolean => {
  const relativePath = path.relative(rootRealPath, candidateRealPath);

  return pathIsInsideOrEqualRoot(relativePath);
};

const assertRealPathInsideRoot = (rootRealPath: string, candidateRealPath: string): void => {
  if (!realPathIsInsideRoot(rootRealPath, candidateRealPath)) {
    throw new RecordStoreError(
      'record_store.path_outside_root',
      'Record path resolves outside the records root.',
      { path: candidateRealPath, root: rootRealPath },
    );
  }
};

const createSegmentInsideRoot = async (
  rootRealPath: string,
  currentPath: string,
): Promise<void> => {
  try {
    await mkdir(currentPath);
  } catch (error) {
    if (!isFileExistsError(error)) {
      throw error;
    }
  }

  const currentRealPath = await realpath(currentPath);
  assertRealPathInsideRoot(rootRealPath, currentRealPath);
};

const ensureSegmentInsideRoot = async (
  rootRealPath: string,
  currentPath: string,
): Promise<void> => {
  try {
    const currentRealPath = await realpath(currentPath);
    assertRealPathInsideRoot(rootRealPath, currentRealPath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    await createSegmentInsideRoot(rootRealPath, currentPath);
  }
};

const ensureRootDirectory = async (root: string): Promise<string> => {
  await mkdir(root, { recursive: true });

  return realpath(root);
};

const ensureWritableParentInsideRoot = async (root: string, targetPath: string): Promise<void> => {
  const rootRealPath = await ensureRootDirectory(root);
  const parentPath = path.dirname(targetPath);
  const relativeParent = assertInsideOrEqualRoot(root, parentPath);
  const segments = relativeParent.split(path.sep).filter((segment) => segment.length > 0);
  let currentPath = root;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    await ensureSegmentInsideRoot(rootRealPath, currentPath);
  }
};

const assertExistingRecordInsideRoot = async (root: string, recordPath: string): Promise<void> => {
  const rootRealPath = await realpath(root);
  const recordRealPath = await realpath(recordPath);
  assertRealPathInsideRoot(rootRealPath, recordRealPath);
};

const readBytesForHashCheck = async (
  absolutePath: string,
  expectedHash: string,
): Promise<Buffer> => {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new StaleRecordError('Record changed before write: file no longer exists.', {
        path: absolutePath,
        expectedHash,
      });
    }

    throw error;
  }
};

const assertCurrentHash = async (absolutePath: string, expectedHash: string): Promise<void> => {
  const bytes = await readBytesForHashCheck(absolutePath, expectedHash);
  const actualHash = hashRawBytes(bytes);

  if (actualHash !== expectedHash) {
    throw new StaleRecordError('Record changed before write: stale read hash.', {
      path: absolutePath,
      expectedHash,
      actualHash,
    });
  }
};

const temporarySiblingPath = (targetPath: string): string => {
  const directory = path.dirname(targetPath);
  const extension = path.extname(targetPath);
  const basename = path.basename(targetPath, extension);

  return path.join(directory, `.${basename}.${randomUUID()}${extension}.tmp`);
};

const cleanupTemporaryFile = async (temporaryPath: string): Promise<void> => {
  try {
    await unlink(temporaryPath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
};

const recordExistsError = (targetPath: string): RecordStoreError =>
  new RecordStoreError('record_store.record_exists', 'Record path already exists.', {
    path: targetPath,
  });

const linkWithoutClobber = async (sourcePath: string, targetPath: string): Promise<void> => {
  try {
    await link(sourcePath, targetPath);
  } catch (error) {
    if (isFileExistsError(error)) {
      throw recordExistsError(targetPath);
    }

    throw error;
  }
};

const createFileNoClobber = async (
  root: string,
  targetPath: string,
  content: string,
): Promise<void> => {
  // The temp sibling makes the bytes complete before publication.
  // Hardlinking it to the target is the Bun/Node-compatible no-clobber final-target primitive.
  await ensureWritableParentInsideRoot(root, targetPath);

  const temporaryPath = temporarySiblingPath(targetPath);

  try {
    await writeFile(temporaryPath, content, { flag: 'wx' });
    await linkWithoutClobber(temporaryPath, targetPath);
  } finally {
    await cleanupTemporaryFile(temporaryPath);
  }
};

const updateFileAtomically = async (
  root: string,
  targetPath: string,
  content: string,
  expectedHash: string,
): Promise<void> => {
  await ensureWritableParentInsideRoot(root, targetPath);

  const temporaryPath = temporarySiblingPath(targetPath);

  try {
    await writeFile(temporaryPath, content, { flag: 'wx' });
    // Decision #3 requires comparing the raw bytes read earlier against the current file bytes immediately before the temp-file rename.
    await assertCurrentHash(targetPath, expectedHash);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await cleanupTemporaryFile(temporaryPath);
    throw error;
  }
};

const moveFileNoClobber = async (
  root: string,
  sourcePath: string,
  targetPath: string,
  expectedHash: string,
): Promise<void> => {
  await ensureWritableParentInsideRoot(root, targetPath);
  await assertExistingRecordInsideRoot(root, sourcePath);
  await assertCurrentHash(sourcePath, expectedHash);
  // Hardlink plus unlink gives move destinations the same no-clobber guarantee as create.
  // A crash after link but before unlink can leave both paths; later check/repair owns cleanup.
  await linkWithoutClobber(sourcePath, targetPath);
  await unlink(sourcePath);
};

const rootExists = async (root: string): Promise<boolean> => {
  try {
    await access(root, fsConstants.F_OK);

    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
};

export {
  assertExistingRecordInsideRoot,
  createFileNoClobber,
  createPathResolver,
  hashRawBytes,
  isMissingFileError,
  moveFileNoClobber,
  rootExists,
  updateFileAtomically,
};
export type { PathResolver, ResolvedRecordPath };
