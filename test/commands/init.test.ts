/* eslint-disable typescript-eslint/no-unsafe-type-assertion, max-lines-per-function, max-statements, no-magic-numbers -- Init CLI tests cast the parsed JSON payload to the known report shape, and scenario cases group many assertions with small literal counts. */
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { errorCodeFromStdout, parseJsonStdout, run } from '../fixtures/cli-repo-fixture.js';

const importLine = '@INTROSPECTION.md';

interface InitImportPayload {
  readonly roles: ReadonlyArray<string>;
  readonly path: string;
  readonly sharedFile: boolean;
  readonly status: string;
}

interface InitReportPayload {
  readonly mode: 'show' | 'write';
  readonly repoKey?: string;
  readonly repoSlug?: string;
  readonly recordsRoot?: string;
  readonly config: { path: string; status: string };
  readonly vocabulary: { path: string; status: string };
  readonly router: { path: string; status: string };
  readonly imports: ReadonlyArray<InitImportPayload>;
}

const initReport = (stdout: string): InitReportPayload =>
  (parseJsonStdout(stdout) as { init: InitReportPayload }).init;

const withTempDir = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-init-cli-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

/*
 * A workspace with a `repo` root and a sibling `outside` directory that lives
 * outside the repo root, for exercising the repo-escape guards.
 */
const withRepoAndOutside = async (
  testBody: (repo: string, outside: string) => Promise<void>,
): Promise<void> => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'introspection-init-cli-'));
  const repo = path.join(workspace, 'repo');
  const outside = path.join(workspace, 'outside');
  await mkdir(repo);
  await mkdir(outside);

  try {
    await testBody(repo, outside);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
};

const readText = async (root: string, relativePath: string): Promise<string> =>
  readFile(path.join(root, relativePath), 'utf8');

const exists = async (absolutePath: string): Promise<boolean> => {
  try {
    await stat(absolutePath);

    return true;
  } catch {
    return false;
  }
};

// Count only the exact column-0 import line; a whitespace-indented near-match is not a functional import.
const countImportLines = (content: string): number =>
  content.split('\n').filter((rawLine) => rawLine.replace(/\r$/u, '') === importLine).length;

describe('init adoption scaffolder CLI command', () => {
  it('scaffolds every artifact in a fresh repo and leaves it loadable', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, ['init', '--repo-key', 'BP', '--repo-slug', 'backpressure']);

      assert.strictEqual(result.exitCode, 0, result.stderr);

      const config = await readText(root, '.introspection/config.toml');
      assert.match(config, /repo_key = "BP"/u);
      assert.match(config, /repo_slug = "backpressure"/u);
      assert.match(config, /\[records\.list\]/u);
      assert.match(config, /root = "docs\/records"/u);

      const vocabulary = await readText(root, '.introspection/vocabulary.toml');
      assert.match(vocabulary, /\[\[terms\]\]/u);

      const router = await readText(root, 'INTROSPECTION.md');
      assert.match(router, /introspection prime/u);
      assert.match(router, /introspection check/u);
      assert.match(router, /--help/u);

      assert.strictEqual(countImportLines(await readText(root, 'CLAUDE.md')), 1);
      assert.strictEqual(countImportLines(await readText(root, 'AGENTS.md')), 1);

      // A freshly scaffolded repo must load cleanly for every other command.
      const prime = await run(root, ['prime']);
      assert.strictEqual(prime.exitCode, 0, prime.stderr);
    });
  });

  it('derives repo_key and repo_slug from the directory name under --yes', async () => {
    await withTempDir(async (root) => {
      const repoDir = path.join(root, 'demo-repo');
      await mkdir(repoDir);

      const result = await run(root, ['init', '--yes', '--root', repoDir, '--json']);
      assert.strictEqual(result.exitCode, 0, result.stderr);

      const report = initReport(result.stdout);
      assert.strictEqual(report.repoSlug, 'demo-repo');
      assert.strictEqual(report.repoKey, 'DEMOREPO');
      assert.strictEqual(report.recordsRoot, 'docs/records');
      assert.strictEqual(await exists(path.join(repoDir, '.introspection/config.toml')), true);
    });
  });

  it('is idempotent and never clobbers an existing config', async () => {
    await withTempDir(async (root) => {
      const first = await run(root, ['init', '--repo-key', 'BP', '--repo-slug', 'backpressure']);
      assert.strictEqual(first.exitCode, 0, first.stderr);

      const configAfterFirst = await readText(root, '.introspection/config.toml');
      const routerAfterFirst = await readText(root, 'INTROSPECTION.md');

      // Re-run with a different identity: config must stay untouched, not be rewritten.
      const second = await run(root, [
        'init',
        '--repo-key',
        'XX',
        '--repo-slug',
        'other',
        '--json',
      ]);
      assert.strictEqual(second.exitCode, 0, second.stderr);

      const report = initReport(second.stdout);
      assert.strictEqual(report.config.status, 'preserved');
      assert.strictEqual(report.vocabulary.status, 'preserved');
      assert.strictEqual(report.router.status, 'generated');
      for (const entry of report.imports) {
        assert.strictEqual(entry.status, 'present');
      }

      assert.strictEqual(countImportLines(await readText(root, 'CLAUDE.md')), 1);
      assert.strictEqual(countImportLines(await readText(root, 'AGENTS.md')), 1);

      assert.strictEqual(await readText(root, '.introspection/config.toml'), configAfterFirst);
      assert.match(await readText(root, '.introspection/config.toml'), /repo_key = "BP"/u);
      // INTROSPECTION.md is fully generated, so a re-run reproduces it byte-for-byte.
      assert.strictEqual(await readText(root, 'INTROSPECTION.md'), routerAfterFirst);
    });
  });

  it('patches a symlinked AGENTS.md exactly once', async () => {
    await withTempDir(async (root) => {
      await writeFile(path.join(root, 'CLAUDE.md'), '# Repo router\n');
      await symlink('CLAUDE.md', path.join(root, 'AGENTS.md'));

      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 0, result.stderr);

      const report = initReport(result.stdout);
      assert.strictEqual(report.imports.length, 1);
      assert.strictEqual(report.imports[0]?.sharedFile, true);
      assert.deepStrictEqual([...(report.imports[0]?.roles ?? [])].sort(), ['agents', 'claude']);

      assert.strictEqual(countImportLines(await readText(root, 'CLAUDE.md')), 1);
      assert.strictEqual(countImportLines(await readText(root, 'AGENTS.md')), 1);
    });
  });

  it('patches separate CLAUDE.md and AGENTS.md independently', async () => {
    await withTempDir(async (root) => {
      await writeFile(path.join(root, 'CLAUDE.md'), '# Claude router\n');
      await writeFile(path.join(root, 'AGENTS.md'), '# Agents router\n');

      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 0, result.stderr);

      const report = initReport(result.stdout);
      assert.strictEqual(report.imports.length, 2);
      for (const entry of report.imports) {
        assert.strictEqual(entry.sharedFile, false);
        assert.strictEqual(entry.status, 'added');
      }

      assert.strictEqual(countImportLines(await readText(root, 'CLAUDE.md')), 1);
      assert.strictEqual(countImportLines(await readText(root, 'AGENTS.md')), 1);
      assert.match(await readText(root, 'CLAUDE.md'), /# Claude router/u);
      assert.match(await readText(root, 'AGENTS.md'), /# Agents router/u);
    });
  });

  it('honors --agents-file for a custom agents path in a new subdirectory', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--agents-file',
        'docs/AGENTS.md',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 0, result.stderr);

      assert.strictEqual(countImportLines(await readText(root, 'docs/AGENTS.md')), 1);
      // The default root-level AGENTS.md must not be created when the agents file is redirected.
      assert.strictEqual(await exists(path.join(root, 'AGENTS.md')), false);
    });
  });

  it('--show reports state without writing anything', async () => {
    await withTempDir(async (root) => {
      const before = await run(root, ['init', '--show', '--json']);
      assert.strictEqual(before.exitCode, 0, before.stderr);

      const reportBefore = initReport(before.stdout);
      assert.strictEqual(reportBefore.mode, 'show');
      assert.strictEqual(reportBefore.config.status, 'absent');
      assert.strictEqual(reportBefore.vocabulary.status, 'absent');
      assert.strictEqual(reportBefore.router.status, 'absent');
      for (const entry of reportBefore.imports) {
        assert.strictEqual(entry.status, 'absent');
      }

      assert.strictEqual(await exists(path.join(root, '.introspection/config.toml')), false);
      assert.strictEqual(await exists(path.join(root, 'INTROSPECTION.md')), false);
      assert.strictEqual(await exists(path.join(root, 'CLAUDE.md')), false);

      await run(root, ['init', '--yes']);

      const after = await run(root, ['init', '--show', '--json']);
      const reportAfter = initReport(after.stdout);
      assert.strictEqual(reportAfter.config.status, 'present');
      assert.strictEqual(reportAfter.vocabulary.status, 'present');
      assert.strictEqual(reportAfter.router.status, 'present');
      for (const entry of reportAfter.imports) {
        assert.strictEqual(entry.status, 'present');
      }
    });
  });

  it('fails clearly when identity values are missing in non-interactive mode', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, ['init', '--json']);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.repo_slug.required');

      // No partial scaffolding: nothing is written when resolution fails.
      assert.strictEqual(await exists(path.join(root, '.introspection')), false);
    });
  });

  it('rejects an invalid repo_key flag value', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, [
        'init',
        '--repo-key',
        'lowercase',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.repo_key.invalid');
    });
  });

  it('rejects --agents-file that escapes the repo root with ../', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--agents-file',
        '../outside.md',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.outside_root');
      assert.strictEqual(await exists(path.join(root, '.introspection')), false);
    });
  });

  it('rejects an absolute --agents-file', async () => {
    await withRepoAndOutside(async (repo, outside) => {
      const result = await run(repo, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--agents-file',
        path.join(outside, 'AGENTS.md'),
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.absolute');
    });
  });

  it('rejects an AGENTS.md symlink that points outside the repo', async () => {
    await withRepoAndOutside(async (repo, outside) => {
      const outsideTarget = path.join(outside, 'router.md');
      await writeFile(outsideTarget, '# Outside router\n');
      await symlink(outsideTarget, path.join(repo, 'AGENTS.md'));

      const result = await run(repo, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.outside_root');
      // The out-of-repo target must be left untouched.
      assert.strictEqual(countImportLines(await readFile(outsideTarget, 'utf8')), 0);
    });
  });

  it('rejects --agents-file pointing at a managed init artifact', async () => {
    await withTempDir(async (root) => {
      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--agents-file',
        'INTROSPECTION.md',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.import_target.managed_artifact');
    });
  });

  it('rejects an AGENTS.md symlink that dangles to a path outside the repo', async () => {
    await withRepoAndOutside(async (repo, outside) => {
      const danglingTarget = path.join(outside, 'AGENTS.md');
      // The target does not exist: an access()/follow check would treat this dangling symlink as "missing" and skip it.
      await symlink(danglingTarget, path.join(repo, 'AGENTS.md'));

      const result = await run(repo, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.outside_root');
      // The out-of-repo target must never be created by following the dangling symlink.
      assert.strictEqual(await exists(danglingTarget), false);
    });
  });

  it('rejects an AGENTS.md symlink that aliases a managed artifact', async () => {
    await withTempDir(async (root) => {
      // An in-repo symlink, so the repo-escape check passes; the managed-artifact check must still reject it.
      await symlink('INTROSPECTION.md', path.join(root, 'AGENTS.md'));

      const result = await run(root, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.import_target.managed_artifact');
      // The router must not have been created or appended through the alias.
      assert.strictEqual(await exists(path.join(root, 'INTROSPECTION.md')), false);
    });
  });

  it('rejects INTROSPECTION.md aliased to a managed output and preserves the config', async () => {
    await withTempDir(async (root) => {
      // Scaffold a real repo, then alias the router to the config so a router write would clobber it.
      const first = await run(root, ['init', '--repo-key', 'BP', '--repo-slug', 'backpressure']);
      assert.strictEqual(first.exitCode, 0, first.stderr);
      const configBefore = await readText(root, '.introspection/config.toml');

      await rm(path.join(root, 'INTROSPECTION.md'));
      await symlink('.introspection/config.toml', path.join(root, 'INTROSPECTION.md'));

      const result = await run(root, ['init', '--json']);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.output_alias');
      // The preserved config must not have been overwritten through the alias.
      assert.strictEqual(await readText(root, '.introspection/config.toml'), configBefore);
    });
  });

  it('rejects a .introspection directory symlinked outside the repo', async () => {
    await withRepoAndOutside(async (repo, outside) => {
      // A symlinked output parent: writes through it would land outside the repo.
      await symlink(outside, path.join(repo, '.introspection'));

      const result = await run(repo, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.outside_root');
      // No config is written into the outside directory, and the router stays absent.
      assert.strictEqual(await exists(path.join(outside, 'config.toml')), false);
      assert.strictEqual(await exists(path.join(repo, 'INTROSPECTION.md')), false);
    });
  });

  it('rejects --records-root under an out-of-repo symlink', async () => {
    await withRepoAndOutside(async (repo, outside) => {
      await symlink(outside, path.join(repo, 'escape'));

      const result = await run(repo, [
        'init',
        '--repo-key',
        'BP',
        '--repo-slug',
        'backpressure',
        '--records-root',
        'escape/records',
        '--json',
      ]);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'init.path.outside_root');
      assert.strictEqual(await exists(path.join(repo, '.introspection/config.toml')), false);
    });
  });

  it('treats a whitespace-padded import line as not installed and adds the real line', async () => {
    await withTempDir(async (root) => {
      await writeFile(path.join(root, 'CLAUDE.md'), '# Router\n\n  @INTROSPECTION.md\n');

      const result = await run(root, ['init', '--repo-key', 'BP', '--repo-slug', 'backpressure']);
      assert.strictEqual(result.exitCode, 0, result.stderr);

      const claude = await readText(root, 'CLAUDE.md');
      // The real column-0 line is added exactly once...
      assert.strictEqual(countImportLines(claude), 1);
      // ...and the pre-existing indented near-match is preserved untouched.
      assert.match(claude, /\n {2}@INTROSPECTION\.md\n/u);
    });
  });
});
