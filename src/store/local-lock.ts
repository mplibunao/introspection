import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { IntrospectionError } from '../core/errors.js';

type LocalLockContext = Readonly<{ locksRoot: string }>;

type LocalLockOptions = Readonly<{
  maxWaitMs?: number;
  retryDelayMs?: number;
  staleAfterMs?: number;
}>;

type LockMetadata = Readonly<{ ownerToken: string; pid: number; timestamp: string }>;

type LockTimeoutDetails = Readonly<{ lockPath: string; maxWaitMs: number }>;

type LockTimeoutErrorFactory = (details: LockTimeoutDetails) => IntrospectionError;

type LocalNamedLockOptions = Readonly<{
  lock?: LocalLockOptions;
  timeoutError?: LockTimeoutErrorFactory;
}>;

type LockDirectoryRuntime = Readonly<{
  lockPath: string;
  metadataPath: string;
  options: Required<LocalLockOptions>;
  ownerToken: string;
}>;

type LocalLockRuntime = LockDirectoryRuntime &
  Readonly<{
    adminLockPath: string;
    adminMetadataPath: string;
    timeoutError: LockTimeoutErrorFactory;
  }>;

type LockMutationDecision = Readonly<{ acquired: boolean; quarantinePath?: string }>;

class LocalLockError extends IntrospectionError {}

const defaultLockOptions = {
  maxWaitMs: 5_000,
  retryDelayMs: 25,
  staleAfterMs: 60_000,
} as const satisfies Required<LocalLockOptions>;

const metadataFileName = 'metadata.json';
const jsonIndentSpaces = 2;

const defaultTimeoutError = (details: LockTimeoutDetails): LocalLockError =>
  new LocalLockError('local_lock.timeout', 'Timed out waiting for the local lock.', details);

const isErrorWithCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;

const isFileExistsError = (error: unknown): boolean => isErrorWithCode(error, 'EEXIST');
const isMissingFileError = (error: unknown): boolean => isErrorWithCode(error, 'ENOENT');

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const normalizeLockOptions = (options: LocalLockOptions = {}): Required<LocalLockOptions> => ({
  maxWaitMs: options.maxWaitMs ?? defaultLockOptions.maxWaitMs,
  retryDelayMs: options.retryDelayMs ?? defaultLockOptions.retryDelayMs,
  staleAfterMs: options.staleAfterMs ?? defaultLockOptions.staleAfterMs,
});

const writeLockMetadata = async (runtime: LockDirectoryRuntime): Promise<void> => {
  const metadata: LockMetadata = {
    ownerToken: runtime.ownerToken,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  };

  await writeFile(runtime.metadataPath, `${JSON.stringify(metadata, null, jsonIndentSpaces)}\n`, {
    flag: 'wx',
  });
};

const isLockMetadata = (value: unknown): value is LockMetadata =>
  typeof value === 'object' &&
  value !== null &&
  'pid' in value &&
  'timestamp' in value &&
  typeof value.pid === 'number' &&
  typeof value.timestamp === 'string' &&
  (!('ownerToken' in value) || typeof value.ownerToken === 'string');

const metadataOwnerToken = (value: LockMetadata): string => {
  if (typeof value.ownerToken === 'string') {
    return value.ownerToken;
  }

  return '';
};

const parseLockMetadata = (source: string): LockMetadata | null => {
  const value: unknown = JSON.parse(source);

  if (isLockMetadata(value)) {
    return {
      ownerToken: metadataOwnerToken(value),
      pid: value.pid,
      timestamp: value.timestamp,
    };
  }

  return null;
};

const readLockMetadata = async (runtime: LockDirectoryRuntime): Promise<LockMetadata | null> => {
  try {
    return parseLockMetadata(await readFile(runtime.metadataPath, 'utf8'));
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
};

const processIsAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    if (isErrorWithCode(error, 'ESRCH')) {
      return false;
    }

    // EPERM means the process exists but this process cannot signal it; treat that as live.
    return true;
  }
};

const metadataTimestamp = (metadata: LockMetadata | null): number => {
  if (!metadata) {
    return Number.NaN;
  }

  return Date.parse(metadata.timestamp);
};

const lockAgeMs = async (
  runtime: LockDirectoryRuntime,
  metadata: LockMetadata | null,
): Promise<number> => {
  const timestamp = metadataTimestamp(metadata);

  if (Number.isFinite(timestamp)) {
    return Date.now() - timestamp;
  }

  const lockStat = await stat(runtime.lockPath);

  return Date.now() - lockStat.mtimeMs;
};

const lockMetadataIsReclaimable = async (runtime: LockDirectoryRuntime): Promise<boolean> => {
  const metadata = await readLockMetadata(runtime);
  const stale = (await lockAgeMs(runtime, metadata)) > runtime.options.staleAfterMs;

  if (stale) {
    return true;
  }

  if (!metadata) {
    return false;
  }

  return !processIsAlive(metadata.pid);
};

const lockIsReclaimable = async (runtime: LockDirectoryRuntime): Promise<boolean> => {
  try {
    return await lockMetadataIsReclaimable(runtime);
  } catch (error) {
    if (isMissingFileError(error)) {
      // Another owner may release the lock between our failed mkdir and reclaimability check.
      return false;
    }

    throw error;
  }
};

const sameLockMetadata = (left: LockMetadata | null, right: LockMetadata | null): boolean =>
  left?.ownerToken === right?.ownerToken &&
  left?.pid === right?.pid &&
  left?.timestamp === right?.timestamp;

const runtimeAtPath = (runtime: LockDirectoryRuntime, lockPath: string): LockDirectoryRuntime => ({
  ...runtime,
  lockPath,
  metadataPath: path.join(lockPath, metadataFileName),
});

const quarantinePathFor = (runtime: LockDirectoryRuntime): string =>
  `${runtime.lockPath}.reclaim-${runtime.ownerToken}`;

const restoreUnexpectedQuarantine = async (
  runtime: LockDirectoryRuntime,
  quarantinePath: string,
  expectedMetadata: LockMetadata | null,
): Promise<string | null> => {
  const quarantinedRuntime = runtimeAtPath(runtime, quarantinePath);
  const quarantinedMetadata = await readLockMetadata(quarantinedRuntime);

  if (sameLockMetadata(expectedMetadata, quarantinedMetadata)) {
    return quarantinePath;
  }

  await rename(quarantinePath, runtime.lockPath);

  return null;
};

const quarantineLockIfStillReclaimable = async (
  runtime: LockDirectoryRuntime,
): Promise<string | null> => {
  const expectedMetadata = await readLockMetadata(runtime);

  if (!(await lockIsReclaimable(runtime))) {
    return null;
  }

  const quarantinePath = quarantinePathFor(runtime);

  try {
    await rename(runtime.lockPath, quarantinePath);

    return await restoreUnexpectedQuarantine(runtime, quarantinePath, expectedMetadata);
  } catch (error) {
    if (isMissingFileError(error) || isFileExistsError(error)) {
      return null;
    }

    throw error;
  }
};

const cleanupLockDirectory = async (runtime: LockDirectoryRuntime): Promise<void> => {
  await rm(runtime.lockPath, { force: true, recursive: true });
};

const tryAcquireLockDirectory = async (runtime: LockDirectoryRuntime): Promise<boolean> => {
  try {
    await mkdir(runtime.lockPath, { recursive: false });
  } catch (error) {
    if (isFileExistsError(error)) {
      return false;
    }

    throw error;
  }

  try {
    await writeLockMetadata(runtime);

    return true;
  } catch (error) {
    await cleanupLockDirectory(runtime);
    throw error;
  }
};

const lockTimeoutDetails = (runtime: LocalLockRuntime): LockTimeoutDetails => ({
  lockPath: runtime.lockPath,
  maxWaitMs: runtime.options.maxWaitMs,
});

const assertLockWaitRemaining = (runtime: LocalLockRuntime, startedAt: number): void => {
  if (Date.now() - startedAt > runtime.options.maxWaitMs) {
    throw runtime.timeoutError(lockTimeoutDetails(runtime));
  }
};

const currentProcessOwnsLock = async (runtime: LockDirectoryRuntime): Promise<boolean> => {
  const metadata = await readLockMetadata(runtime);

  return metadata?.pid === process.pid && metadata.ownerToken === runtime.ownerToken;
};

const releaseLockDirectory = async (runtime: LockDirectoryRuntime): Promise<void> => {
  if (await currentProcessOwnsLock(runtime)) {
    await cleanupLockDirectory(runtime);
  }
};

const adminRuntimeFor = (runtime: LocalLockRuntime): LockDirectoryRuntime => ({
  ...runtime,
  lockPath: runtime.adminLockPath,
  metadataPath: runtime.adminMetadataPath,
});

const removeQuarantinedPath = async (quarantinePath: string | null): Promise<void> => {
  if (quarantinePath) {
    await rm(quarantinePath, { force: true, recursive: true });
  }
};

const acquireAdminLock = async (
  runtime: LocalLockRuntime,
  startedAt: number,
): Promise<LockDirectoryRuntime> => {
  const adminRuntime = adminRuntimeFor(runtime);

  while (!(await tryAcquireLockDirectory(adminRuntime))) {
    const quarantinePath = await quarantineLockIfStillReclaimable(adminRuntime);
    await removeQuarantinedPath(quarantinePath);
    assertLockWaitRemaining(runtime, startedAt);
    await sleep(runtime.options.retryDelayMs);
  }

  return adminRuntime;
};

// Invariant: the admin lock only serializes canonical lock create/reclaim/release mutations.
// Allocation and repair work run under the canonical lock; stale locks move to quarantine before deletion.
const withAdminLock = async <Result>(
  runtime: LocalLockRuntime,
  startedAt: number,
  work: () => Promise<Result>,
): Promise<Result> => {
  const adminRuntime = await acquireAdminLock(runtime, startedAt);

  try {
    return await work();
  } finally {
    await releaseLockDirectory(adminRuntime);
  }
};

const decideCanonicalLockMutation = async (
  runtime: LocalLockRuntime,
): Promise<LockMutationDecision> => {
  if (await tryAcquireLockDirectory(runtime)) {
    return { acquired: true };
  }

  const quarantinePath = await quarantineLockIfStillReclaimable(runtime);

  if (quarantinePath) {
    return { acquired: false, quarantinePath };
  }

  return { acquired: false };
};

const removeQuarantinedLock = async (decision: LockMutationDecision): Promise<void> => {
  await removeQuarantinedPath(decision.quarantinePath ?? null);
};

const waitAfterBlockedLockDecision = async (
  runtime: LocalLockRuntime,
  startedAt: number,
  decision: LockMutationDecision,
): Promise<void> => {
  if (!decision.quarantinePath) {
    assertLockWaitRemaining(runtime, startedAt);
    await sleep(runtime.options.retryDelayMs);
  }
};

const acquireLock = async (runtime: LocalLockRuntime): Promise<void> => {
  await mkdir(path.dirname(runtime.lockPath), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    const decision = await withAdminLock(runtime, startedAt, async () =>
      decideCanonicalLockMutation(runtime),
    );
    await removeQuarantinedLock(decision);

    if (decision.acquired) {
      return;
    }

    await waitAfterBlockedLockDecision(runtime, startedAt, decision);
  }
};

const releaseCanonicalLock = async (runtime: LocalLockRuntime): Promise<void> => {
  await withAdminLock(runtime, Date.now(), async () => releaseLockDirectory(runtime));
};

const withLocalNamedLock = async <Result>(
  context: LocalLockContext,
  lockName: string,
  work: () => Promise<Result>,
  options: LocalNamedLockOptions = {},
): Promise<Result> => {
  const lockPath = path.join(context.locksRoot, lockName);
  const adminLockPath = `${lockPath}.admin`;
  const runtime: LocalLockRuntime = {
    adminLockPath,
    adminMetadataPath: path.join(adminLockPath, metadataFileName),
    lockPath,
    metadataPath: path.join(lockPath, metadataFileName),
    options: normalizeLockOptions(options.lock),
    ownerToken: randomUUID(),
    timeoutError: options.timeoutError ?? defaultTimeoutError,
  };

  await acquireLock(runtime);

  try {
    return await work();
  } finally {
    await releaseCanonicalLock(runtime);
  }
};

export { LocalLockError, withLocalNamedLock };
export type { LocalLockContext, LocalLockOptions, LocalNamedLockOptions, LockMetadata };
