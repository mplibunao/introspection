/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { IntrospectionError } from './errors.js';
import {
  effectiveTargetPath,
  isMissingPathError,
  resolveSafeRepoPath,
} from './repo-path-safety.js';
import type { SafePathErrors } from './repo-path-safety.js';

const claudeFileName = 'CLAUDE.md';
const agentsFileName = 'AGENTS.md';

/*
 * The single stable line both CLAUDE.md and AGENTS.md import. The line never
 * changes across versions: only INTROSPECTION.md content does, so adopters who
 * pinned the line keep a working import after an upgrade.
 */
const importLine = '@INTROSPECTION.md';

type ImportRole = 'agents' | 'claude';
type ImportLineStatus = 'absent' | 'added' | 'created' | 'present';

interface ImportTargetPlan {
  readonly roles: ReadonlyArray<ImportRole>;
  readonly absolutePath: string;
  readonly exists: boolean;
  // True when CLAUDE.md and AGENTS.md resolve to the same file (the symlink/hardlink convention), so init patches it once.
  readonly sharedFile: boolean;
}

interface InitImportReport {
  readonly roles: ReadonlyArray<ImportRole>;
  readonly path: string;
  readonly sharedFile: boolean;
  readonly status: ImportLineStatus;
}

const stripTrailingCarriageReturn = (value: string): string => value.replace(/\r$/u, '');

/*
 * Dedupe on the exact column-0 line (tolerating a CRLF line ending) — a
 * whitespace-indented `@INTROSPECTION.md` is not a functional Claude import, so
 * it must not be mistaken for an installed line, or init would skip adding the
 * real one and the repo would silently lack the import.
 */
const containsImportLine = (content: string): boolean =>
  content.split('\n').some((rawLine) => stripTrailingCarriageReturn(rawLine) === importLine);

/*
 * Append the import line at end-of-file with a blank separator. Existing
 * trailing newlines are normalised first so repeated installs never grow extra
 * blank lines, and an empty file gets just the line.
 */
const withImportLineAppended = (content: string): string => {
  const trimmedEnd = content.replace(/\n+$/u, '');

  if (trimmedEnd.length === 0) {
    return `${importLine}\n`;
  }

  return `${trimmedEnd}\n\n${importLine}\n`;
};

const importLineFileContent = (): string => `${importLine}\n`;

const statKey = async (filePath: string): Promise<{ exists: boolean; key: string }> => {
  try {
    const info = await stat(filePath);

    // Matching dev+ino identifies the underlying file, so a symlink or hardlink shared by both targets collapses to one key.
    return { exists: true, key: `inode:${info.dev}:${info.ino}` };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { exists: false, key: `path:${filePath}` };
    }

    throw error;
  }
};

interface ResolvedTarget {
  readonly role: ImportRole;
  readonly filePath: string;
  readonly exists: boolean;
  readonly key: string;
}

interface TargetGroup {
  roles: Array<ImportRole>;
  absolutePath: string;
  exists: boolean;
}

const groupTargetsByKey = (resolved: ReadonlyArray<ResolvedTarget>): Map<string, TargetGroup> => {
  const byKey = new Map<string, TargetGroup>();

  for (const entry of resolved) {
    const found = byKey.get(entry.key);

    if (found) {
      found.roles.push(entry.role);
    } else {
      byKey.set(entry.key, {
        roles: [entry.role],
        absolutePath: entry.filePath,
        exists: entry.exists,
      });
    }
  }

  return byKey;
};

/*
 * Plan the distinct files to patch. CLAUDE.md is listed first so it becomes the
 * canonical path for a shared inode, and an absent file keys on its own path so
 * two missing files are still planned as two creates.
 */
const planImportTargets = async (
  claudePath: string,
  agentsPath: string,
): Promise<ReadonlyArray<ImportTargetPlan>> => {
  const entries: ReadonlyArray<{ role: ImportRole; filePath: string }> = [
    { role: 'claude', filePath: claudePath },
    { role: 'agents', filePath: agentsPath },
  ];
  const resolved = await Promise.all(
    entries.map(async (entry) => ({ ...entry, ...(await statKey(entry.filePath)) })),
  );
  const byKey = groupTargetsByKey(resolved);

  return [...byKey.values()].map((target) => ({
    roles: target.roles,
    absolutePath: target.absolutePath,
    exists: target.exists,
    sharedFile: target.roles.length > 1,
  }));
};

const installImportTarget = async (plan: ImportTargetPlan): Promise<ImportLineStatus> => {
  if (!plan.exists) {
    // A custom --agents-file may point into a subdirectory that does not exist yet.
    await mkdir(path.dirname(plan.absolutePath), { recursive: true });
    await writeFile(plan.absolutePath, importLineFileContent());

    return 'created';
  }

  const content = await readFile(plan.absolutePath, 'utf8');

  if (containsImportLine(content)) {
    return 'present';
  }

  await writeFile(plan.absolutePath, withImportLineAppended(content));

  return 'added';
};

const showImportStatus = async (plan: ImportTargetPlan): Promise<ImportLineStatus> => {
  if (!plan.exists) {
    return 'absent';
  }

  const content = await readFile(plan.absolutePath, 'utf8');

  if (containsImportLine(content)) {
    return 'present';
  }

  return 'absent';
};

const toImportReport = (
  plan: ImportTargetPlan,
  status: ImportLineStatus,
  repoRoot: string,
): InitImportReport => ({
  roles: plan.roles,
  path: path.relative(repoRoot, plan.absolutePath),
  sharedFile: plan.sharedFile,
  status,
});

interface ImportTargets {
  readonly claudePath: string;
  readonly agentsPath: string;
}

interface ImportTargetContext {
  readonly repoRoot: string;
  readonly managedTargets: ReadonlyArray<string>;
  readonly errors: SafePathErrors;
}

const assertNotManagedAlias = async (
  intendedAbsolute: string,
  fieldName: string,
  managedTargets: ReadonlyArray<string>,
): Promise<void> => {
  const effective = await effectiveTargetPath(intendedAbsolute);

  if (managedTargets.includes(effective)) {
    throw new IntrospectionError(
      'init.import_target.managed_artifact',
      `${fieldName} must not resolve to an init-managed artifact (INTROSPECTION.md or the .introspection config/vocabulary).`,
      { fieldName, resolved: effective },
    );
  }
};

const resolveImportTarget = async (
  context: ImportTargetContext,
  configured: string,
  fieldName: string,
): Promise<string> => {
  // Check managed-artifact aliasing before the repo-escape check so a dangling alias to a managed artifact reports that reason, not a generic escape.
  await assertNotManagedAlias(
    path.resolve(context.repoRoot, configured),
    fieldName,
    context.managedTargets,
  );

  return resolveSafeRepoPath(context.repoRoot, configured, fieldName, context.errors);
};

/*
 * Resolve the CLAUDE.md and agents-file targets through the shared safe-path
 * policy so a repo-scoped command can never patch a file outside its root via
 * an absolute --agents-file, a ../ escape, or a symlink pointing outside.
 * Neither target may resolve (through a symlink, including a dangling one) to a
 * managed init artifact named in managedArtifactPaths.
 */
const resolveImportTargets = async (
  repoRoot: string,
  managedArtifactPaths: ReadonlyArray<string>,
  agentsFileFlag: string | undefined,
  errors: SafePathErrors,
): Promise<ImportTargets> => {
  const managedTargets = await Promise.all(managedArtifactPaths.map(effectiveTargetPath));
  const context: ImportTargetContext = { repoRoot, managedTargets, errors };
  const claudePath = await resolveImportTarget(context, claudeFileName, 'CLAUDE.md');
  const agentsConfigured = agentsFileFlag ?? agentsFileName;
  const agentsPath = await resolveImportTarget(context, agentsConfigured, 'agents-file');

  return { claudePath, agentsPath };
};

export {
  containsImportLine,
  importLine,
  importLineFileContent,
  installImportTarget,
  isMissingPathError,
  planImportTargets,
  resolveImportTargets,
  showImportStatus,
  toImportReport,
  withImportLineAppended,
};
export type { ImportLineStatus, ImportRole, ImportTargetPlan, ImportTargets, InitImportReport };
