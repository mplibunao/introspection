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

const readExpectedVersion = async (): Promise<string> => {
  const manifest: unknown = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('Root package.json is missing a string version.');
  }

  return manifest.version;
};

const assertHelpWorks = async (
  projectDirectory: string,
  expectedVersion: string,
): Promise<void> => {
  const { stdout } = await run(
    path.join(projectDirectory, 'node_modules/.bin/introspection'),
    ['--help'],
    projectDirectory,
  );

  // Exact banner match, not a substring search, so a version string appearing elsewhere can't mask a wrong banner.
  const banner =
    stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';

  if (banner !== `introspection ${expectedVersion}`) {
    throw new Error(
      `Packed CLI help banner was "${banner}", expected "introspection ${expectedVersion}":\n${stdout}`,
    );
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

// The --help banner only proves the bundled CLI version; assert each installed manifest too, to catch a published package whose version drifted from the main package.
const assertInstalledVersion = async (
  projectDirectory: string,
  packageDirectory: string,
  expectedVersion: string,
): Promise<void> => {
  const manifest: unknown = JSON.parse(
    await readFile(
      path.join(projectDirectory, 'node_modules/@mplibunao', packageDirectory, 'package.json'),
      'utf8',
    ),
  );

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`Installed @mplibunao/${packageDirectory} is missing a string version.`);
  }

  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Installed @mplibunao/${packageDirectory} version ${manifest.version} does not match expected ${expectedVersion}.`,
    );
  }
};

const assertInstalledProject = async (
  label: string,
  projectDirectory: string,
  platformPackage: PlatformPackage,
  expectedVersion: string,
): Promise<void> => {
  await assertInstalledVersion(projectDirectory, 'introspection', expectedVersion);

  if (label === 'fallback') {
    await assertNoPlatformPackagePresent(projectDirectory, platformPackage);
  } else {
    await assertInstalledVersion(projectDirectory, platformPackage.directory, expectedVersion);
  }

  await assertHelpWorks(projectDirectory, expectedVersion);
  await assertCheckWorks(projectDirectory);
};

const smokeProject = async (
  label: string,
  installArgs: ReadonlyArray<string>,
  platformPackage: PlatformPackage,
  expectedVersion: string,
): Promise<void> => {
  const projectDirectory = await mkdtemp(path.join(os.tmpdir(), `introspection-${label}-smoke-`));

  try {
    await runPnpm(['add', ...installArgs, '--ignore-scripts', '--no-optional'], projectDirectory);
    await assertInstalledProject(label, projectDirectory, platformPackage, expectedVersion);
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
  const expectedVersion = await readExpectedVersion();
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

  await smokeProject('native', [mainTarball, platformTarball], platformPackage, expectedVersion);
  await smokeProject('fallback', [mainTarball], platformPackage, expectedVersion);
} finally {
  await rm(packDirectory, { force: true, recursive: true });
}
