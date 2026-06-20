import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import type { CliCommandContext } from '../../../commands/types.js';
import { IntrospectionError } from '../../../core/errors.js';
import {
  installImportTarget,
  planImportTargets,
  resolveImportTargets,
  showImportStatus,
  toImportReport,
} from '../../../core/init-import-line.js';
import {
  defaultRecordsRoot,
  deriveRepoKey,
  deriveRepoSlug,
  renderConfigToml,
  renderRouterMarkdown,
  starterVocabulary,
  validateRepoKey,
  validateRepoSlug,
} from '../../../core/init-scaffold.js';
import {
  effectiveTargetPath,
  pathExists,
  resolveSafeRepoPath,
} from '../../../core/repo-path-safety.js';
import { renderVocabularyToml } from '../../../core/vocabulary-file.js';
import { initHuman } from '../../../presenters/human.js';
import { initJson } from '../../../presenters/json.js';

const resolveSafeRepoPathErrorsIndex = 3;

type ImportLineStatus = ReturnType<typeof toImportReport>['status'];
type ConfigArtifactStatus = 'absent' | 'created' | 'preserved' | 'present';
type SafePathErrors = Parameters<typeof resolveSafeRepoPath>[typeof resolveSafeRepoPathErrorsIndex];
type ImportTargetPlan = Parameters<typeof toImportReport>[0];
type ImportTargets = Awaited<ReturnType<typeof resolveImportTargets>>;
type InitImportReport = ReturnType<typeof toImportReport>;
type InitReport = Parameters<typeof initJson>[0];
type ResolvedConfigValues = Parameters<typeof renderConfigToml>[0];

/*
 * Filesystem orchestration for `introspection init`: resolve the repo root,
 * the managed output paths, and the import-line targets, then either report
 * adoption state (--show) or write the scaffold. The Effect command surface
 * (config typing, flag-map projection, dispatch) lives in ./index.ts.
 */

const introspectionDirName = '.introspection';
const configFileName = 'config.toml';
const vocabularyFileName = 'vocabulary.toml';
const routerFileName = 'INTROSPECTION.md';

// Bind the shared repo-path policy to init's own error namespace.
const initSafePathErrors: SafePathErrors = {
  absolute: (configuredPath, fieldName) =>
    new IntrospectionError(
      'init.path.absolute',
      `${fieldName} must be a repo-relative path, not an absolute path.`,
      { fieldName, path: configuredPath },
    ),
  outsideRoot: (repoRoot, configuredPath, fieldName, details = {}) =>
    new IntrospectionError(
      'init.path.outside_root',
      `${fieldName} must resolve inside the repo root.`,
      { fieldName, path: configuredPath, repoRoot, ...details },
    ),
};

interface RepoPaths {
  readonly introspectionDir: string;
  readonly configPath: string;
  readonly vocabularyPath: string;
  readonly routerPath: string;
}

interface ScalarResolution {
  readonly flagValue: string | undefined;
  readonly derived: string | undefined;
  readonly useDefaults: boolean;
  readonly canPrompt: boolean;
  readonly label: string;
  readonly validate: (value: string) => string;
  readonly missing: () => IntrospectionError;
}

interface InitInputs {
  readonly repoKey?: string;
  readonly repoSlug?: string;
  readonly recordsRoot?: string;
  readonly agentsFile?: string;
  readonly yes: boolean;
  readonly show: boolean;
}

interface ConfigInputs {
  readonly repoRoot: string;
  readonly inputs: InitInputs;
  readonly useDefaults: boolean;
  readonly canPrompt: boolean;
}

interface WriteInputs {
  readonly repoRoot: string;
  readonly paths: RepoPaths;
  readonly targets: ImportTargets;
  readonly inputs: InitInputs;
  readonly context: CliCommandContext;
}

interface ConfigOutcome {
  readonly status: ConfigArtifactStatus;
  readonly repoKey?: string;
  readonly repoSlug?: string;
  readonly recordsRoot?: string;
}

/*
 * Init is the bootstrap, so it discovers the repo root WITHOUT loadRepoContext
 * (which requires an existing config). The root is the resolved context cwd
 * (already overridden by --root at the boundary): a deterministic invariant
 * that needs no git and no prior config.
 */
const resolveRepoRoot = (context: CliCommandContext): string =>
  path.resolve(context.cwd ?? process.cwd());

/*
 * Reject when two managed outputs resolve to the same file, so an in-repo alias
 * cannot let the router write clobber a preserved config.
 */
const assertNoOutputAliasing = async (paths: RepoPaths): Promise<void> => {
  const effectiveTargets = await Promise.all([
    effectiveTargetPath(paths.configPath),
    effectiveTargetPath(paths.vocabularyPath),
    effectiveTargetPath(paths.routerPath),
  ]);

  if (new Set(effectiveTargets).size !== effectiveTargets.length) {
    throw new IntrospectionError(
      'init.output_alias',
      'init outputs (config.toml, vocabulary.toml, INTROSPECTION.md) must be distinct files; one resolves to another, which would let a write clobber a preserved file.',
      { effectiveTargets },
    );
  }
};

/*
 * Resolve the managed output paths through the same safe-path policy as the
 * import targets, so every path init writes is confirmed inside the repo.
 */
const repoPathsFor = async (repoRoot: string): Promise<RepoPaths> => {
  const configPath = await resolveSafeRepoPath(
    repoRoot,
    path.join(introspectionDirName, configFileName),
    '.introspection/config.toml',
    initSafePathErrors,
  );
  const vocabularyPath = await resolveSafeRepoPath(
    repoRoot,
    path.join(introspectionDirName, vocabularyFileName),
    '.introspection/vocabulary.toml',
    initSafePathErrors,
  );
  const routerPath = await resolveSafeRepoPath(
    repoRoot,
    routerFileName,
    'INTROSPECTION.md',
    initSafePathErrors,
  );
  const paths: RepoPaths = {
    introspectionDir: path.join(repoRoot, introspectionDirName),
    configPath,
    vocabularyPath,
    routerPath,
  };
  await assertNoOutputAliasing(paths);

  return paths;
};

const promptText = (label: string, fallback: string | undefined): string => {
  if (fallback) {
    return `${label} [${fallback}]: `;
  }

  return `${label}: `;
};

// Prompts are written to stderr so they never contaminate stdout (including --json payloads).
const promptValue = async (label: string, fallback: string | undefined): Promise<string> => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    const answer = (await readline.question(promptText(label, fallback))).trim();

    if (answer.length > 0) {
      return answer;
    }

    return fallback ?? '';
  } finally {
    readline.close();
  }
};

const resolveFromDefault = (resolution: ScalarResolution): string => {
  if (resolution.derived) {
    return resolution.validate(resolution.derived);
  }

  throw resolution.missing();
};

/*
 * Resolve a config scalar with explicit precedence: an explicit flag wins;
 * otherwise --yes uses the derived default; otherwise prompt when interactive;
 * otherwise fail loudly. init never silently invents a value.
 */
const resolveScalar = async (resolution: ScalarResolution): Promise<string> => {
  if (resolution.flagValue) {
    return resolution.validate(resolution.flagValue);
  }

  if (resolution.useDefaults) {
    return resolveFromDefault(resolution);
  }

  if (resolution.canPrompt) {
    const answer = await promptValue(resolution.label, resolution.derived);

    if (answer.length > 0) {
      return resolution.validate(answer);
    }
  }

  throw resolution.missing();
};

const requiredValueError = (field: string, flag: string, repoRoot: string): IntrospectionError =>
  new IntrospectionError(
    `init.${field}.required`,
    `${field} could not be determined. Provide --${flag} explicitly, or run with --yes to derive it from the directory name.`,
    { repoRoot },
  );

const resolveRepoSlug = async (inputs: ConfigInputs): Promise<string> =>
  resolveScalar({
    flagValue: inputs.inputs.repoSlug,
    derived: deriveRepoSlug(inputs.repoRoot),
    useDefaults: inputs.useDefaults,
    canPrompt: inputs.canPrompt,
    label: 'repo slug',
    validate: validateRepoSlug,
    missing: () => requiredValueError('repo_slug', 'repo-slug', inputs.repoRoot),
  });

const resolveRepoKey = async (inputs: ConfigInputs, slug: string): Promise<string> =>
  resolveScalar({
    flagValue: inputs.inputs.repoKey,
    derived: deriveRepoKey(slug),
    useDefaults: inputs.useDefaults,
    canPrompt: inputs.canPrompt,
    label: 'repo key',
    validate: validateRepoKey,
    missing: () => requiredValueError('repo_key', 'repo-key', inputs.repoRoot),
  });

/*
 * Validate the records root through the same realpath-safe resolver repo-context
 * applies at load time, then store the normalised repo-relative value.
 */
const safeRecordsRoot = async (repoRoot: string, configured: string): Promise<string> => {
  await resolveSafeRepoPath(repoRoot, configured, 'records-root', initSafePathErrors);

  return path.normalize(configured);
};

/*
 * Records root always has a safe default, so it never requires --yes or a flag.
 */
const resolveRecordsRoot = async (inputs: ConfigInputs): Promise<string> => {
  const flagValue = inputs.inputs.recordsRoot;

  if (flagValue) {
    return safeRecordsRoot(inputs.repoRoot, flagValue);
  }

  if (inputs.canPrompt) {
    const answer = await promptValue('records root', defaultRecordsRoot);

    if (answer.length > 0) {
      return safeRecordsRoot(inputs.repoRoot, answer);
    }
  }

  return safeRecordsRoot(inputs.repoRoot, defaultRecordsRoot);
};

const writeIfAbsent = async (filePath: string, content: string): Promise<ConfigArtifactStatus> => {
  if (await pathExists(filePath)) {
    return 'preserved';
  }

  // The wx flag fails rather than clobbers if the file appears between the check and the write.
  await writeFile(filePath, content, { flag: 'wx' });

  return 'created';
};

const showArtifactStatus = async (filePath: string): Promise<'absent' | 'present'> => {
  if (await pathExists(filePath)) {
    return 'present';
  }

  return 'absent';
};

const showArtifactReport = async (
  repoRoot: string,
  filePath: string,
): Promise<{
  readonly path: string;
  readonly status: 'absent' | 'present';
}> => ({
  path: path.relative(repoRoot, filePath),
  status: await showArtifactStatus(filePath),
});

const importReportsFor = async (
  targets: ImportTargets,
  repoRoot: string,
  statusFor: (plan: ImportTargetPlan) => Promise<ImportLineStatus>,
): Promise<ReadonlyArray<InitImportReport>> => {
  const plans = await planImportTargets(targets.claudePath, targets.agentsPath);

  return Promise.all(
    plans.map(async (plan) => toImportReport(plan, await statusFor(plan), repoRoot)),
  );
};

const runShow = async (
  repoRoot: string,
  paths: RepoPaths,
  targets: ImportTargets,
): Promise<InitReport> => {
  const imports = await importReportsFor(targets, repoRoot, showImportStatus);
  const config = await showArtifactReport(repoRoot, paths.configPath);
  const vocabulary = await showArtifactReport(repoRoot, paths.vocabularyPath);
  const router = await showArtifactReport(repoRoot, paths.routerPath);

  return { mode: 'show', repoRoot, config, vocabulary, router, imports };
};

const interactiveTty = (): boolean => process.stdin.isTTY ?? false;

const resolveConfigValues = async (inputs: WriteInputs): Promise<ResolvedConfigValues> => {
  const useDefaults = inputs.inputs.yes;
  // Interactive prompting only when a human is attached: never in --yes or --json runs, and never without a TTY.
  const canPrompt = !useDefaults && !inputs.context.json && interactiveTty();
  const configInputs: ConfigInputs = {
    repoRoot: inputs.repoRoot,
    inputs: inputs.inputs,
    useDefaults,
    canPrompt,
  };
  const repoSlug = await resolveRepoSlug(configInputs);
  const repoKey = await resolveRepoKey(configInputs, repoSlug);
  const recordsRoot = await resolveRecordsRoot(configInputs);

  return { repoKey, repoSlug, recordsRoot };
};

/*
 * Resolve and write config.toml only when it is absent. An existing config is
 * preserved untouched, so a re-run needs no new values and stays friction-free.
 */
const resolveConfig = async (inputs: WriteInputs): Promise<ConfigOutcome> => {
  if (await pathExists(inputs.paths.configPath)) {
    return { status: 'preserved' };
  }

  const values = await resolveConfigValues(inputs);

  // Create .introspection only after values resolve, so a failed resolution leaves no stray directory.
  await mkdir(inputs.paths.introspectionDir, { recursive: true });
  await writeFile(inputs.paths.configPath, renderConfigToml(values), {
    flag: 'wx',
  });

  return { status: 'created', ...values };
};

const runWrite = async (inputs: WriteInputs): Promise<InitReport> => {
  const { repoRoot, paths, targets, context } = inputs;
  const config = await resolveConfig(inputs);
  // The preserved-config refresh path skips the config write, so ensure the directory exists for the vocabulary write.
  await mkdir(paths.introspectionDir, { recursive: true });
  const vocabularyStatus = await writeIfAbsent(
    paths.vocabularyPath,
    renderVocabularyToml(starterVocabulary(context.now())),
  );
  await writeFile(paths.routerPath, renderRouterMarkdown());
  const imports = await importReportsFor(targets, repoRoot, installImportTarget);

  return {
    mode: 'write',
    repoRoot,
    ...(config.repoKey && { repoKey: config.repoKey }),
    ...(config.repoSlug && { repoSlug: config.repoSlug }),
    ...(config.recordsRoot && { recordsRoot: config.recordsRoot }),
    config: {
      path: path.relative(repoRoot, paths.configPath),
      status: config.status,
    },
    vocabulary: {
      path: path.relative(repoRoot, paths.vocabularyPath),
      status: vocabularyStatus,
    },
    router: {
      path: path.relative(repoRoot, paths.routerPath),
      status: 'generated',
    },
    imports,
  };
};

const runInit = async (inputs: WriteInputs): Promise<InitReport> => {
  if (inputs.inputs.show) {
    return runShow(inputs.repoRoot, inputs.paths, inputs.targets);
  }

  return runWrite(inputs);
};

const renderReport = (json: boolean, report: InitReport): string => {
  if (json) {
    return initJson(report);
  }

  return initHuman(report);
};

const executeInit = async (inputs: InitInputs, context: CliCommandContext): Promise<string> => {
  const repoRoot = resolveRepoRoot(context);
  const paths = await repoPathsFor(repoRoot);
  const targets = await resolveImportTargets(
    repoRoot,
    [paths.routerPath, paths.configPath, paths.vocabularyPath],
    inputs.agentsFile,
    initSafePathErrors,
  );
  const report = await runInit({ repoRoot, paths, targets, inputs, context });

  return renderReport(context.json, report);
};

export { executeInit };
export type { InitInputs };
