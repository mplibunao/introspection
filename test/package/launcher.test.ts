import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { assert, describe, it } from '@effect/vitest';

const execFileAsync = promisify(execFile);
const launcherSourcePath = path.resolve('scripts/launcher.sh');
const executableMode = 0o755;
const platformPackages = [
  {
    cpu: 'arm64',
    directory: 'introspection-darwin-arm64',
    os: 'darwin',
    platformId: 'darwin-arm64',
  },
  {
    cpu: 'x64',
    directory: 'introspection-linux-x64',
    os: 'linux',
    platformId: 'linux-x64',
  },
  {
    cpu: 'arm64',
    directory: 'introspection-linux-arm64',
    os: 'linux',
    platformId: 'linux-arm64',
  },
] as const;

const currentPlatformPackage = (): string => {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin' && arch === 'arm64') {
    return 'introspection-darwin-arm64';
  }

  if (platform === 'linux' && arch === 'x64') {
    return 'introspection-linux-x64';
  }

  if (platform === 'linux' && arch === 'arm64') {
    return 'introspection-linux-arm64';
  }

  return 'introspection-unsupported';
};

const writeExecutable = async (filePath: string, content: string): Promise<void> => {
  await writeFile(filePath, content, { mode: executableMode });
};

const stderrFromExecError = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  ) {
    return error.stderr;
  }

  return '';
};

const seedLauncherPackage = async (root: string): Promise<string> => {
  const packageDirectory = path.join(root, 'node_modules/@mplibunao/introspection');
  const distDirectory = path.join(packageDirectory, 'dist');
  await mkdir(distDirectory, { recursive: true });
  await writeFile(
    path.join(distDirectory, 'launcher.sh'),
    await readFile(launcherSourcePath, 'utf8'),
    {
      mode: executableMode,
    },
  );
  await writeFile(path.join(distDirectory, 'bin.mjs'), 'console.log("fallback bundle");\n');

  return path.join(distDirectory, 'launcher.sh');
};

const withTempPackage = async (
  testBody: (launcherPath: string, root: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-launcher-'));

  try {
    const launcherPath = await seedLauncherPackage(root);
    await testBody(launcherPath, root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

describe('WI-13 package launcher', () => {
  it('keeps launcher platform IDs aligned with platform package manifests', async () => {
    const launcherSource = await readFile(launcherSourcePath, 'utf8');

    for (const platformPackage of platformPackages) {
      const manifest = await readFile(
        path.join('packages', platformPackage.directory, 'package.json'),
        'utf8',
      );

      assert.ok(launcherSource.includes(`"${platformPackage.platformId}"`));
      assert.ok(manifest.includes(`"name": "@mplibunao/${platformPackage.directory}"`));
      assert.ok(manifest.includes(`"${platformPackage.os}"`));
      assert.ok(manifest.includes(`"${platformPackage.cpu}"`));
    }
  });

  it('prefers the matching optional platform binary when it is installed', async () => {
    await withTempPackage(async (launcherPath, root) => {
      const platformPackage = currentPlatformPackage();
      const binaryPath = path.join(
        root,
        'node_modules/@mplibunao',
        platformPackage,
        'bin/introspection',
      );
      await mkdir(path.dirname(binaryPath), { recursive: true });
      await writeExecutable(binaryPath, '#!/usr/bin/env sh\nprintf "platform:%s\\n" "$1"\n');

      const { stdout } = await execFileAsync(launcherPath, ['ok']);

      assert.strictEqual(stdout, 'platform:ok\n');
    });
  });

  it('falls back to running the JS bundle with host Bun when no platform binary exists', async () => {
    await withTempPackage(async (launcherPath, root) => {
      const fakeBinDirectory = path.join(root, 'fake-bin');
      const bunLogPath = path.join(root, 'bun-args.txt');
      await mkdir(fakeBinDirectory, { recursive: true });
      await writeExecutable(
        path.join(fakeBinDirectory, 'bun'),
        `#!/usr/bin/env sh\nprintf '%s\\n' "$@" > ${JSON.stringify(bunLogPath)}\n`,
      );

      const { stdout } = await execFileAsync(launcherPath, ['--help'], {
        env: { ...process.env, PATH: `${fakeBinDirectory}:/usr/bin:/bin` },
      });

      assert.strictEqual(stdout, '');
      assert.match(await readFile(bunLogPath, 'utf8'), /bin\.mjs\n--help\n/u);
    });
  });

  it('prints an actionable error when neither a platform binary nor Bun exists', async () => {
    await withTempPackage(async (launcherPath) => {
      try {
        await execFileAsync(launcherPath, [], { env: { ...process.env, PATH: '/usr/bin:/bin' } });
        assert.fail('launcher should fail without a platform binary or Bun');
      } catch (error: unknown) {
        const stderr = stderrFromExecError(error);

        assert.match(stderr, /No compiled @mplibunao\/introspection platform package/u);
        assert.match(stderr, /Install Bun >=1\.3\.11/u);
      }
    });
  });
});
