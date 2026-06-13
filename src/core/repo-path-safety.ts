import { constants as fsConstants } from 'node:fs';
import { access, lstat, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { IntrospectionError } from './errors.js';

/*
 * Callers supply the error namespace so this policy stays shared while each
 * caller keeps its own error codes (config.* for repo-context, init.* for the
 * init scaffolder). The policy itself — repo-relative, no absolute paths, and a
 * realpath check that rejects symlinked targets or parent segments resolving
 * outside the repo — is identical for every caller.
 */
interface SafePathErrors {
  readonly absolute: (configuredPath: string, fieldName: string) => IntrospectionError;
  readonly outsideRoot: (
    repoRoot: string,
    configuredPath: string,
    fieldName: string,
    details?: Record<string, unknown>,
  ) => IntrospectionError;
}

const isMissingPathError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath, fsConstants.F_OK);

    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

/*
 * Unlike access(), lstat does not follow the final path component, so a symlink
 * — including a dangling one whose target is absent — counts as existing. The
 * ancestor walk relies on this: an access()/follow check would treat a dangling
 * symlink as missing, skip past it, and let the realpath check pass on the repo
 * root while a later write follows the symlink outside the repo.
 */
const symlinkAwareExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await lstat(candidatePath);

    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

const readlinkOrEmpty = async (candidatePath: string): Promise<string> => {
  try {
    return await readlink(candidatePath);
  } catch {
    return '';
  }
};

/*
 * Resolve a path to the file it effectively names: realpath when it (and any
 * symlinks) resolve; otherwise, for a dangling symlink, the one-level link-text
 * target; otherwise the path itself. Callers use this to see through an in-repo
 * symlink and through a dangling symlink whose link text names a guarded file.
 */
const effectiveTargetPath = async (absolutePath: string): Promise<string> => {
  try {
    return await realpath(absolutePath);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  const linkText = await readlinkOrEmpty(absolutePath);

  if (linkText.length > 0) {
    return path.resolve(path.dirname(absolutePath), linkText);
  }

  return absolutePath;
};

interface SafePathRequest {
  readonly repoRoot: string;
  readonly configuredPath: string;
  readonly fieldName: string;
  readonly errors: SafePathErrors;
}

const relativePathIsInsideOrEqualRoot = (relativePath: string): boolean =>
  relativePath.length === 0 ||
  (!relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath));

const resolveRelativeUnderRepoRoot = (request: SafePathRequest): string => {
  if (path.isAbsolute(request.configuredPath)) {
    throw request.errors.absolute(request.configuredPath, request.fieldName);
  }

  const absolutePath = path.resolve(request.repoRoot, request.configuredPath);
  const relativePath = path.relative(request.repoRoot, absolutePath);

  if (!relativePathIsInsideOrEqualRoot(relativePath)) {
    throw request.errors.outsideRoot(request.repoRoot, request.configuredPath, request.fieldName);
  }

  return absolutePath;
};

const nearestExistingAncestor = async (absolutePath: string): Promise<string> => {
  let candidatePath = absolutePath;

  while (!(await symlinkAwareExists(candidatePath))) {
    const parent = path.dirname(candidatePath);

    if (parent === candidatePath) {
      return candidatePath;
    }

    candidatePath = parent;
  }

  return candidatePath;
};

/*
 * The realpath of the nearest existing ancestor resolves it through any
 * symlinks. A dangling symlink there throws ENOENT: its target cannot be
 * confirmed inside the repo, so reject it rather than let a later write follow
 * it outside.
 */
const realpathOrReject = async (targetPath: string, request: SafePathRequest): Promise<string> => {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      throw request.errors.outsideRoot(
        request.repoRoot,
        request.configuredPath,
        request.fieldName,
        { unresolvedSymlink: targetPath },
      );
    }

    throw error;
  }
};

const assertRealPathInsideRepoRoot = async (
  request: SafePathRequest,
  absolutePath: string,
): Promise<void> => {
  const repoRootRealPath = await realpath(request.repoRoot);
  const existingAncestor = await nearestExistingAncestor(absolutePath);
  const existingAncestorRealPath = await realpathOrReject(existingAncestor, request);
  const relativeRealPath = path.relative(repoRootRealPath, existingAncestorRealPath);

  if (!relativePathIsInsideOrEqualRoot(relativeRealPath)) {
    throw request.errors.outsideRoot(request.repoRoot, request.configuredPath, request.fieldName, {
      existingAncestor,
      existingAncestorRealPath,
      repoRootRealPath,
    });
  }
};

const resolveSafeRepoPath = async (
  repoRoot: string,
  configuredPath: string,
  fieldName: string,
  errors: SafePathErrors,
): Promise<string> => {
  const request: SafePathRequest = { repoRoot, configuredPath, fieldName, errors };
  const absolutePath = resolveRelativeUnderRepoRoot(request);
  // The lexical check blocks obvious ../ escapes. The realpath check blocks symlinked targets or parent segments that resolve outside the repo.
  await assertRealPathInsideRepoRoot(request, absolutePath);

  return absolutePath;
};

export { effectiveTargetPath, isMissingPathError, pathExists, resolveSafeRepoPath };
export type { SafePathErrors };
