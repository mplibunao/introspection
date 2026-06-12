import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface PlatformBuildTarget {
  readonly bunTarget: string;
  readonly packageDirectory: string;
}

const bundlePath = path.resolve('dist/bin.mjs');
const executableMode = 0o755;

const targets: ReadonlyArray<PlatformBuildTarget> = [
  {
    bunTarget: 'bun-darwin-arm64',
    packageDirectory: 'packages/introspection-darwin-arm64',
  },
  {
    bunTarget: 'bun-linux-x64',
    packageDirectory: 'packages/introspection-linux-x64',
  },
  {
    bunTarget: 'bun-linux-arm64',
    packageDirectory: 'packages/introspection-linux-arm64',
  },
];

const buildTarget = async ({ bunTarget, packageDirectory }: PlatformBuildTarget): Promise<void> => {
  const binDirectory = path.join(packageDirectory, 'bin');
  const outfile = path.join(binDirectory, 'introspection');
  await mkdir(binDirectory, { recursive: true });

  const result = spawnSync(
    'bun',
    ['build', '--compile', `--target=${bunTarget}`, `--outfile=${outfile}`, bundlePath],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  await chmod(outfile, executableMode);
};

for (const target of targets) {
  await buildTarget(target);
}
