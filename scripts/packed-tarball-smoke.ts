import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface PlatformPackage {
  readonly directory: string;
  readonly tarballPattern: RegExp;
}

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

const root = process.cwd();

const currentPlatformPackage = (): PlatformPackage => {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin' && arch === 'arm64') {
    return {
      directory: 'introspection-darwin-arm64',
      tarballPattern: /^mplibunao-introspection-darwin-arm64-.*\.tgz$/u,
    };
  }

  if (platform === 'linux' && arch === 'x64') {
    return {
      directory: 'introspection-linux-x64',
      tarballPattern: /^mplibunao-introspection-linux-x64-.*\.tgz$/u,
    };
  }

  if (platform === 'linux' && arch === 'arm64') {
    return {
      directory: 'introspection-linux-arm64',
      tarballPattern: /^mplibunao-introspection-linux-arm64-.*\.tgz$/u,
    };
  }

  throw new Error(`No platform package exists for ${platform}/${arch}.`);
};

const run = async (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<CommandResult> => {
  const { stderr, stdout } = await execFileAsync(command, [...args], {
    cwd,
  });

  return { stderr, stdout };
};

const runPnpm = async (args: ReadonlyArray<string>, cwd: string): Promise<CommandResult> =>
  run('corepack', ['pnpm', ...args], cwd);

const findTarball = async (
  packDirectory: string,
  pattern: RegExp,
  description: string,
): Promise<string> => {
  const matches = (await readdir(packDirectory)).filter((entry) => pattern.test(entry));

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${description} tarball in ${packDirectory}; found ${matches.length}.`,
    );
  }

  const [tarball] = matches;

  if (!tarball) {
    throw new Error(`No ${description} tarball found in ${packDirectory}.`);
  }

  return path.join(packDirectory, tarball);
};

const seedFixture = async (projectDirectory: string): Promise<void> => {
  await mkdir(path.join(projectDirectory, '.introspection'), { recursive: true });
  await mkdir(path.join(projectDirectory, 'docs/records/tech-debt/open'), { recursive: true });
  await writeFile(
    path.join(projectDirectory, '.introspection/config.toml'),
    [
      'schema_version = 1',
      'repo_key = "BP"',
      'repo_slug = "backpressure"',
      '',
      '[records]',
      'root = "docs/records"',
      '',
      '[defaults]',
      'visibility = "local-only"',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(projectDirectory, '.introspection/vocabulary.toml'),
    [
      'schema_version = 1',
      '',
      '[[terms]]',
      'tag = "topic/package-smoke"',
      'status = "approved"',
      'description = "Package smoke test fixture."',
      '',
      '[terms.provenance]',
      'kind = "plan"',
      'ref = "docs/adoption.md"',
      'noted_at = "2026-06-12T00:00:00Z"',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(projectDirectory, 'docs/records/tech-debt/open/bp-td-001.md'),
    [
      '---',
      'schema_version: 1',
      'id: BP-TD-001',
      'repo_key: BP',
      'record_type: tech-debt',
      'number: 1',
      'title: Package smoke',
      'status: open',
      'type: introspection-record',
      'category: tech-debt',
      'visibility: local-only',
      'created_at: "2026-06-12T00:00:00Z"',
      'updated_at: "2026-06-12T00:00:00Z"',
      'tags: [record/tech-debt, repo/backpressure, status/open, visibility/local-only, topic/package-smoke]',
      'source:',
      '  discovered_at: "2026-06-12T00:00:00Z"',
      '  refs:',
      '    - kind: plan',
      '      ref: docs/adoption.md',
      '---',
      'Smoke record.',
      '',
      '## Problem',
      'The installed package must parse YAML frontmatter.',
      '',
      '## Why deferred',
      'The package smoke test validates packaging before downstream repo adoption.',
      '',
      '## Revisit trigger',
      'Revisit when package installation changes.',
      '',
    ].join('\n'),
  );
};

const assertHelpWorks = async (projectDirectory: string): Promise<void> => {
  const { stdout } = await run(
    path.join(projectDirectory, 'node_modules/.bin/introspection'),
    ['--help'],
    projectDirectory,
  );

  if (!stdout.includes('introspection 0.0.0')) {
    throw new Error(`Packed CLI help output did not include the expected version:\n${stdout}`);
  }
};

const assertCheckWorks = async (projectDirectory: string): Promise<void> => {
  await seedFixture(projectDirectory);
  const { stdout } = await run(
    path.join(projectDirectory, 'node_modules/.bin/introspection'),
    ['check', '--json'],
    projectDirectory,
  );
  const payload: unknown = JSON.parse(stdout);

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true
  ) {
    throw new Error(`Packed CLI check did not pass:\n${stdout}`);
  }
};

const assertNoPlatformPackagePresent = async (
  projectDirectory: string,
  platformPackage: PlatformPackage,
): Promise<void> => {
  try {
    await readFile(
      path.join(
        projectDirectory,
        'node_modules/@mplibunao',
        platformPackage.directory,
        'package.json',
      ),
      'utf8',
    );
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  throw new Error(`Expected ${platformPackage.directory} to be absent for the fallback smoke.`);
};

const smokeProject = async (
  label: string,
  installArgs: ReadonlyArray<string>,
  platformPackage: PlatformPackage,
): Promise<void> => {
  const projectDirectory = await mkdtemp(path.join(os.tmpdir(), `introspection-${label}-smoke-`));

  try {
    await runPnpm(['add', ...installArgs, '--ignore-scripts', '--no-optional'], projectDirectory);

    if (label === 'fallback') {
      await assertNoPlatformPackagePresent(projectDirectory, platformPackage);
    }

    await assertHelpWorks(projectDirectory);
    await assertCheckWorks(projectDirectory);
    process.stdout.write(`${label} packed install smoke passed\n`);
  } finally {
    await rm(projectDirectory, { force: true, recursive: true });
  }
};

const packDirectory = await mkdtemp(path.join(os.tmpdir(), 'introspection-pack-'));

try {
  await runPnpm(['build'], root);
  await runPnpm(['--recursive', 'pack', '--pack-destination', packDirectory], root);

  const platformPackage = currentPlatformPackage();
  const mainTarball = await findTarball(
    packDirectory,
    /^mplibunao-introspection-\d.*\.tgz$/u,
    'main package',
  );
  const platformTarball = await findTarball(
    packDirectory,
    platformPackage.tarballPattern,
    platformPackage.directory,
  );

  await smokeProject('native', [mainTarball, platformTarball], platformPackage);
  await smokeProject('fallback', [mainTarball], platformPackage);
} finally {
  await rm(packDirectory, { force: true, recursive: true });
}
