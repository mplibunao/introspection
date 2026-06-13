import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { ConfigLoadError, findConfigPath, loadRepoContext } from '../../src/config/index.js';

const timestamp = '2026-06-11T00:00:00Z';

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-config-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const assertRejectsWith = async <ErrorType extends Error>(
  promise: Promise<unknown>,
  errorConstructor: new (...args: Array<never>) => ErrorType,
): Promise<ErrorType> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof errorConstructor);

    return error;
  }

  assert.fail(`Expected promise to reject with ${errorConstructor.name}.`);
};

const configToml = (overrides = ''): string =>
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
    '[[policy_docs]]',
    'name = "Tech debt policy"',
    'path = "docs/references/tech-debt-policy.md"',
    'applies_to = ["tech-debt"]',
    overrides,
  ]
    .filter((line) => line.length > 0)
    .join('\n');

const vocabularyToml = (overrides = ''): string =>
  [
    'schema_version = 1',
    '',
    '[[terms]]',
    'tag = "record/tech-debt"',
    'status = "approved"',
    'description = "Records for accepted technical debt deferrals."',
    '',
    '[terms.provenance]',
    'kind = "plan"',
    'ref = "docs/design-input/introspection-seed-2026-06-01.md"',
    `noted_at = "${timestamp}"`,
    overrides,
  ]
    .filter((line) => line.length > 0)
    .join('\n');

const writeIntrospectionFiles = async (
  repoRoot: string,
  configSource = configToml(),
  vocabularySource = vocabularyToml(),
): Promise<void> => {
  const configDirectory = path.join(repoRoot, '.introspection');
  await mkdir(configDirectory, { recursive: true });
  await writeFile(path.join(configDirectory, 'config.toml'), configSource);
  await writeFile(path.join(configDirectory, 'vocabulary.toml'), vocabularySource);
};

const writeConfigOnly = async (repoRoot: string, configSource = configToml()): Promise<void> => {
  const configDirectory = path.join(repoRoot, '.introspection');
  await mkdir(configDirectory, { recursive: true });
  await writeFile(path.join(configDirectory, 'config.toml'), configSource);
};

const assertContextPaths = async (repoRoot: string, nestedCwd: string): Promise<void> => {
  const context = await loadRepoContext({ cwd: nestedCwd });

  assert.strictEqual(context.repoRoot, repoRoot);
  assert.strictEqual(context.introspectionRoot, path.join(repoRoot, '.introspection'));
  assert.strictEqual(context.configPath, path.join(repoRoot, '.introspection/config.toml'));
  assert.strictEqual(context.vocabularyPath, path.join(repoRoot, '.introspection/vocabulary.toml'));
  assert.strictEqual(context.locksRoot, path.join(repoRoot, '.introspection/.locks'));
  assert.strictEqual(context.recordsRoot, path.join(repoRoot, 'docs/records'));
};

const assertContextMetadata = async (repoRoot: string, nestedCwd: string): Promise<void> => {
  const context = await loadRepoContext({ cwd: nestedCwd });

  assert.strictEqual(context.repoKey, 'BP');
  assert.strictEqual(context.repoSlug, 'backpressure');
  assert.strictEqual(context.defaultVisibility, 'local-only');
  assert.deepStrictEqual(context.policyDocs, [
    {
      name: 'Tech debt policy',
      path: 'docs/references/tech-debt-policy.md',
      applies_to: ['tech-debt'],
      relativePath: path.normalize('docs/references/tech-debt-policy.md'),
    },
  ]);
  assert.strictEqual(context.vocabulary.terms[0]?.tag, 'record/tech-debt');
};

const assertNormalizedContext = async (repoRoot: string, nestedCwd: string): Promise<void> => {
  await assertContextPaths(repoRoot, nestedCwd);
  await assertContextMetadata(repoRoot, nestedCwd);
};

describe('repo context discovery and normalization', () => {
  it('discovers the nearest ancestor config from a nested cwd and normalizes repo context', async () => {
    await withTempRoot(async (repoRoot) => {
      const nestedCwd = path.join(repoRoot, 'docs/records/tech-debt/open');
      await mkdir(nestedCwd, { recursive: true });
      await writeIntrospectionFiles(repoRoot);

      await assertNormalizedContext(repoRoot, nestedCwd);
    });
  });

  it('discovers from an existing file cwd by starting at that file parent', async () => {
    await withTempRoot(async (repoRoot) => {
      const fileCwd = path.join(repoRoot, 'docs/records/example.md');
      await mkdir(path.dirname(fileCwd), { recursive: true });
      await writeFile(fileCwd, '# Example record placeholder\n');
      await writeIntrospectionFiles(repoRoot);

      await assertNormalizedContext(repoRoot, fileCwd);
    });
  });

  it('chooses the nearest ancestor when multiple configs exist', async () => {
    await withTempRoot(async (outerRoot) => {
      const innerRoot = path.join(outerRoot, 'packages/inner');
      const nestedCwd = path.join(innerRoot, 'docs/records');
      await mkdir(nestedCwd, { recursive: true });
      await writeIntrospectionFiles(outerRoot, configToml('\nrepo_key = "OUTER"'));
      await writeIntrospectionFiles(innerRoot);

      assert.strictEqual(
        await findConfigPath(nestedCwd),
        path.join(innerRoot, '.introspection/config.toml'),
      );
    });
  });
});

describe('repo context failure modes', () => {
  it('reports a missing config instead of falling back to git or the package root', async () => {
    await withTempRoot(async (root) => {
      const error = await assertRejectsWith(loadRepoContext({ cwd: root }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.not_found');
    });
  });

  it('reports invalid config TOML', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(repoRoot, 'schema_version = [unterminated');

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.invalid_toml');
    });
  });

  it('reports missing vocabulary as a structured loader error', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeConfigOnly(repoRoot);

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'vocabulary.not_found');
    });
  });

  it('reports config schema violations', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(
        repoRoot,
        configToml().replace('repo_key = "BP"', 'repo_key = "bp"'),
      );

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.schema_violation');
      assert.ok(Array.isArray(error.details['errors']));
    });
  });

  it('reports vocabulary schema violations', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(
        repoRoot,
        configToml(),
        vocabularyToml().replace('tag = "record/tech-debt"', 'tag = "Record/Tech-Debt"'),
      );

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'vocabulary.schema_violation');
      assert.ok(Array.isArray(error.details['errors']));
    });
  });

  it('rejects records roots that escape the discovered repo root', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(
        repoRoot,
        configToml().replace('root = "docs/records"', 'root = "../records"'),
      );

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.path_outside_repo_root');
      assert.strictEqual(error.details['fieldName'], 'records.root');
    });
  });
});

describe('repo context relative path policy', () => {
  it('rejects absolute repo config paths', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(
        repoRoot,
        configToml().replace(
          'root = "docs/records"',
          `root = "${path.join(repoRoot, 'docs/records')}"`,
        ),
      );

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.absolute_path');
      assert.strictEqual(error.details['fieldName'], 'records.root');
    });
  });

  it('rejects absolute policy document paths', async () => {
    await withTempRoot(async (repoRoot) => {
      await writeIntrospectionFiles(
        repoRoot,
        configToml().replace(
          'path = "docs/references/tech-debt-policy.md"',
          `path = "${path.join(repoRoot, 'docs/references/tech-debt-policy.md')}"`,
        ),
      );

      const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

      assert.strictEqual(error.code, 'config.absolute_path');
      assert.strictEqual(error.details['fieldName'], 'policy_docs.path');
    });
  });
});

describe('repo context symlink failure modes', () => {
  it('rejects a symlinked records root that resolves outside the repo', async () => {
    await withTempRoot(async (repoRoot) => {
      const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-'));

      try {
        await writeIntrospectionFiles(repoRoot);
        await mkdir(path.join(repoRoot, 'docs'), { recursive: true });
        await symlink(outsideRoot, path.join(repoRoot, 'docs/records'), 'dir');

        const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

        assert.strictEqual(error.code, 'config.path_outside_repo_root');
        assert.strictEqual(error.details['fieldName'], 'records.root');
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });

  it('rejects records roots below a symlinked parent that resolves outside the repo', async () => {
    await withTempRoot(async (repoRoot) => {
      const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-'));

      try {
        await writeIntrospectionFiles(
          repoRoot,
          configToml().replace('root = "docs/records"', 'root = "docs/link/records"'),
        );
        await mkdir(path.join(repoRoot, 'docs'), { recursive: true });
        await symlink(outsideRoot, path.join(repoRoot, 'docs/link'), 'dir');

        const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

        assert.strictEqual(error.code, 'config.path_outside_repo_root');
        assert.strictEqual(error.details['fieldName'], 'records.root');
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });

  it('rejects policy document paths below a symlinked parent outside the repo', async () => {
    await withTempRoot(async (repoRoot) => {
      const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-'));

      try {
        await writeIntrospectionFiles(
          repoRoot,
          configToml().replace(
            'path = "docs/references/tech-debt-policy.md"',
            'path = "docs/link/tech-debt-policy.md"',
          ),
        );
        await mkdir(path.join(repoRoot, 'docs'), { recursive: true });
        await symlink(outsideRoot, path.join(repoRoot, 'docs/link'), 'dir');

        const error = await assertRejectsWith(loadRepoContext({ cwd: repoRoot }), ConfigLoadError);

        assert.strictEqual(error.code, 'config.path_outside_repo_root');
        assert.strictEqual(error.details['fieldName'], 'policy_docs.path');
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });
});
