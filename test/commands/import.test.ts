import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { loadAppServices, validationContextFor } from '../../src/cli/app-services.js';
import { runCli } from '../../src/commands/index.js';
import type { CliRunResult } from '../../src/commands/types.js';
import { IntrospectionError } from '../../src/core/errors.js';
import { runImport as runImportService } from '../../src/import/import-service.js';
import { loadManifest } from '../../src/import/manifest.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';
import {
  errorCodeFromStdout,
  now,
  parseJsonStdout,
  run,
  techDebtRecord,
  term,
  withTempRepo,
} from '../fixtures/cli-repo-fixture.js';

type ImportManifest = Awaited<ReturnType<typeof loadManifest>>;
type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type MarkdownRecordReadResult = Awaited<
  ReturnType<MarkdownRecordStore['listRecordResults']>
>[number];

const importRepoOptions = {
  tmpDirPrefix: 'introspection-import-cli-',
  vocabularyTerms: [term('owner/mp'), term('topic/records')],
} as const;

const discoveredAt = '2026-06-10T00:00:00Z';

interface ManifestEntry {
  readonly number?: number;
  readonly legacy_id?: string;
  readonly title: string;
  readonly status: string;
  readonly sections: ReadonlyArray<{
    readonly heading: string;
    readonly body: string;
  }>;
  readonly resolution?: unknown;
  readonly source_refs?: unknown;
  readonly tags?: ReadonlyArray<string>;
}

interface Manifest {
  readonly schema_version: number;
  readonly record_type: string;
  readonly id_policy: string;
  readonly source?: unknown;
  readonly entries: ReadonlyArray<ManifestEntry>;
}

interface ImportPayload {
  readonly ok: boolean;
  readonly import: {
    readonly written: boolean;
    readonly record_type: string;
    readonly id_policy: string;
    readonly entries: ReadonlyArray<{
      readonly record_id: string;
      readonly status: string;
      readonly path: string;
      readonly legacy_id?: string;
      readonly findings: ReadonlyArray<{
        readonly code: string;
        readonly severity: string;
      }>;
    }>;
  };
}

const sections = (): ReadonlyArray<{
  readonly heading: string;
  readonly body: string;
}> => [
  { heading: '## Problem', body: 'The preset is framework-specific.' },
  {
    heading: '## Why deferred',
    body: 'The current phase has a smaller scope.',
  },
  {
    heading: '## Revisit trigger',
    body: 'Revisit when a second framework adopts it.',
  },
];

const openEntry = (number: number, legacyId: string): ManifestEntry => ({
  number,
  legacy_id: legacyId,
  title: `Active follow-up ${legacyId}`,
  status: 'open',
  sections: sections(),
});

const rejectedEntry = (number: number, legacyId: string): ManifestEntry => ({
  number,
  legacy_id: legacyId,
  title: `Rejected item ${legacyId}`,
  status: 'rejected',
  sections: sections(),
  resolution: {
    rationale: 'The direction was settled elsewhere, so this is closed.',
  },
});

const supersededEntry = (number: number, legacyId: string): ManifestEntry => ({
  number,
  legacy_id: legacyId,
  title: `Superseded item ${legacyId}`,
  status: 'superseded',
  sections: sections(),
  resolution: {
    rationale: 'Ownership moved to a design doc.',
    evidence_refs: [{ kind: 'doc', ref: 'docs/design-docs/rule-intake.md' }],
  },
});

const manifestWith = (
  entries: ReadonlyArray<ManifestEntry>,
  overrides: Partial<Manifest> = {},
): Manifest => ({
  schema_version: 1,
  record_type: 'tech-debt',
  id_policy: 'preserve',
  source: {
    tracker_path: 'docs/exec-plans/tech-debt-tracker.md',
    discovered_at: discoveredAt,
  },
  entries,
  ...overrides,
});

const writeManifest = async (root: string, manifest: Manifest): Promise<string> => {
  const manifestPath = path.join(root, 'import-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return manifestPath;
};

const runImport = async (
  root: string,
  manifest: Manifest,
  extraArgs: ReadonlyArray<string> = [],
): Promise<CliRunResult> => {
  const manifestPath = await writeManifest(root, manifest);

  return run(root, ['import', '--manifest', manifestPath, '--json', ...extraArgs]);
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);

    return true;
  } catch {
    return false;
  }
};

const recordsPath = (root: string, relativePath: string): string =>
  path.join(root, 'docs/records', relativePath);

const readFileText = async (target: string): Promise<string> => readFile(target, 'utf8');

const writeUnreadable = async (root: string, relativePath: string): Promise<void> => {
  const target = recordsPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, 'not a parseable record');
};

const entryFindingCodes = (payload: ImportPayload, recordId: string): ReadonlyArray<string> =>
  payload.import.entries
    .filter((entry) => entry.record_id === recordId)
    .flatMap((entry) => entry.findings.map((finding) => finding.code));

const expectCheckPasses = async (root: string, expectedCount: number): Promise<void> => {
  const check = await run(root, ['check', '--json']);
  const payload = parseJsonStdout(check.stdout) as {
    ok: boolean;
    checkedRecordCount: number;
  };

  assert.strictEqual(check.exitCode, 0);
  assert.strictEqual(payload.ok, true);
  assert.strictEqual(payload.checkedRecordCount, expectedCount);
};

const captureError = async (work: Promise<unknown>): Promise<unknown> => {
  try {
    await work;

    return null;
  } catch (error) {
    return error;
  }
};

const resultRelativePath = (result: MarkdownRecordReadResult): string => {
  if (result.ok) {
    return result.record.relativePath;
  }

  return result.relativePath ?? result.inputPath;
};

/*
 * Wraps a real store but hides one path from preflight (pathExists + the corpus listing) so
 * the import attempts a create the preflight believed was free — modeling a file another
 * writer created after preflight. createRecord/deleteRecord still delegate to the real store,
 * so the real no-clobber primitive fires and rollback runs against real files.
 */
const racingStore = (realStore: MarkdownRecordStore, hiddenPath: string): MarkdownRecordStore => ({
  ...realStore,
  listRecordResults: async (): Promise<ReadonlyArray<MarkdownRecordReadResult>> =>
    (await realStore.listRecordResults()).filter(
      (result) => resultRelativePath(result) !== hiddenPath,
    ),
  pathExists: async (relativePath): Promise<boolean> => {
    if (relativePath === hiddenPath) {
      return false;
    }

    return realStore.pathExists(relativePath);
  },
});

const loadManifestFor = async (
  root: string,
  entries: ReadonlyArray<ManifestEntry>,
): Promise<ImportManifest> => loadManifest(await writeManifest(root, manifestWith(entries)));

describe('import CLI command', () => {
  it('writes a valid manifest as records that pass check', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([
        openEntry(7, 'TD-007'),
        rejectedEntry(1, 'TD-001'),
        supersededEntry(2, 'TD-002'),
      ]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.ok, true);
      assert.strictEqual(payload.import.written, true);
      assert.deepStrictEqual(
        payload.import.entries.map((entry) => entry.record_id),
        ['BP-TD-007', 'BP-TD-001', 'BP-TD-002'],
      );
      await expectCheckPasses(root, 3);
    });
  });

  it('preserves legacy IDs as tracker source refs without any backpressure constants', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([rejectedEntry(1, 'TD-001'), openEntry(7, 'TD-007')]);
      const result = await runImport(root, manifest);

      assert.strictEqual(result.exitCode, 0);

      const td007 = await readFileText(recordsPath(root, 'tech-debt/open/bp-td-007.md'));

      assert.match(td007, /docs\/exec-plans\/tech-debt-tracker\.md#td-007/u);
      assert.match(td007, /kind: tracker/u);
    });
  });

  it('does not write any records on --dry-run', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([openEntry(7, 'TD-007')]);
      const result = await runImport(root, manifest, ['--dry-run']);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.ok, true);
      assert.strictEqual(payload.import.written, false);
      assert.strictEqual(await pathExists(recordsPath(root, 'tech-debt/open/bp-td-007.md')), false);

      const real = await runImport(root, manifest);

      assert.strictEqual(real.exitCode, 0);
      assert.strictEqual(await pathExists(recordsPath(root, 'tech-debt/open/bp-td-007.md')), true);
    });
  });

  it('fails before writing when terminal lifecycle evidence is missing', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([
        {
          number: 2,
          legacy_id: 'TD-002',
          title: 'Superseded without evidence',
          status: 'superseded',
          sections: sections(),
          resolution: {
            rationale: 'Ownership moved, but no evidence ref was provided.',
          },
        },
      ]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.strictEqual(payload.import.written, false);
      assert.ok(
        entryFindingCodes(payload, 'BP-TD-002').includes(
          'lifecycle.resolution.evidence_refs.required',
        ),
      );
      assert.strictEqual(
        await pathExists(recordsPath(root, 'tech-debt/superseded/bp-td-002.md')),
        false,
      );
    });
  });

  it('fails with a stable error for an unknown record type', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([openEntry(1, 'TD-001')], {
        record_type: 'made-up',
      });
      const result = await runImport(root, manifest);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'import.record_type.unknown');
    });
  });

  it('fails before any write when a target path already exists', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const collisionDir = recordsPath(root, 'tech-debt/open');
      await mkdir(collisionDir, { recursive: true });
      await writeFile(path.join(collisionDir, 'bp-td-002.md'), 'not a parseable record');

      const manifest = manifestWith([openEntry(1, 'TD-001'), openEntry(2, 'TD-002')]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.ok(entryFindingCodes(payload, 'BP-TD-002').includes('import.path.exists'));
      // No partial writes: the other candidate must not have landed.
      assert.strictEqual(await pathExists(recordsPath(root, 'tech-debt/open/bp-td-001.md')), false);
    });
  });

  it('fails when an entry ID collides with an existing on-disk record', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const store = createMarkdownRecordStore({
        root: path.join(root, 'docs/records'),
      });
      await store.createRecord(
        'tech-debt/open/bp-td-007.md',
        techDebtRecord(7, 'Existing active record', '2026-06-01T00:00:00Z'),
      );

      const manifest = manifestWith([rejectedEntry(7, 'TD-007')]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.ok(entryFindingCodes(payload, 'BP-TD-007').includes('id.duplicate'));
      assert.strictEqual(
        await pathExists(recordsPath(root, 'tech-debt/rejected/bp-td-007.md')),
        false,
      );
    });
  });
});

describe('import CLI command ID and number safety', () => {
  it('detects an ID collision with an unreadable record in a different status dir', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      // Broken record at the open path; the candidate lands in rejected/ (a different path), so only path-independent ID-collision detection catches it.
      await writeUnreadable(root, 'tech-debt/open/bp-td-007.md');
      const manifest = manifestWith([rejectedEntry(7, 'TD-007')]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.ok(entryFindingCodes(payload, 'BP-TD-007').includes('id.duplicate'));
      assert.strictEqual(
        await pathExists(recordsPath(root, 'tech-debt/rejected/bp-td-007.md')),
        false,
      );
    });
  });

  it('allocates past an unreadable record so its number is never reused', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      await writeUnreadable(root, 'tech-debt/open/bp-td-009.md');
      const manifest = manifestWith(
        [
          {
            title: 'Allocated after the gap',
            status: 'open',
            sections: sections(),
          },
        ],
        { id_policy: 'allocate' },
      );
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.deepStrictEqual(
        payload.import.entries.map((entry) => entry.record_id),
        ['BP-TD-010'],
      );
    });
  });

  it('fails when two manifest entries share a number under preserve', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([openEntry(1, 'TD-001'), openEntry(1, 'TD-001-DUP')]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;
      const collidingEntries = payload.import.entries.filter(
        (entry) => entry.record_id === 'BP-TD-001',
      );

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.strictEqual(collidingEntries.length, 2);
      assert.ok(
        collidingEntries.every((entry) =>
          entry.findings.some((finding) => finding.code === 'id.duplicate'),
        ),
      );
      assert.strictEqual(await pathExists(recordsPath(root, 'tech-debt/open/bp-td-001.md')), false);
    });
  });

  it('allocates sequential numbers after the highest existing record', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const store = createMarkdownRecordStore({
        root: path.join(root, 'docs/records'),
      });
      await store.createRecord(
        'tech-debt/open/bp-td-004.md',
        techDebtRecord(4, 'Existing record', '2026-06-01T00:00:00Z'),
      );

      const manifest = manifestWith(
        [
          { title: 'Allocated A', status: 'open', sections: sections() },
          { title: 'Allocated B', status: 'open', sections: sections() },
        ],
        { id_policy: 'allocate' },
      );
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.deepStrictEqual(
        payload.import.entries.map((entry) => entry.record_id),
        ['BP-TD-005', 'BP-TD-006'],
      );
    });
  });

  it('rejects unknown flags and missing manifest with stable argument errors', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const bogus = await run(root, [
        'import',
        '--manifest',
        'x.json',
        '--bogus',
        'value',
        '--json',
      ]);
      assert.strictEqual(bogus.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(bogus.stdout), 'cli.argument.invalid');

      const missing = await run(root, ['import', '--json']);
      assert.strictEqual(missing.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(missing.stdout), 'cli.flag.required');
    });
  });

  it('prints the manifest schema without requiring a repo', async () => {
    const bare = await mkdtemp(path.join(os.tmpdir(), 'introspection-import-schema-'));

    try {
      const result = await runCli({
        args: ['import', '--print-schema'],
        cwd: bare,
        now: () => now,
      });
      const schema = parseJsonStdout(result.stdout) as {
        $id: string;
        properties: { entries: unknown };
      };

      assert.strictEqual(result.exitCode, 0);
      assert.match(schema.$id, /import-manifest\.schema\.json$/u);
      assert.ok(schema.properties.entries);
    } finally {
      await rm(bare, { force: true, recursive: true });
    }
  });
});

describe('import preflight and write safety', () => {
  it('refuses to probe or write outside the records root for a traversal status', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const manifest = manifestWith([{ ...openEntry(1, 'TD-001'), status: '../../escape' }]);
      const result = await runImport(root, manifest);
      const payload = parseJsonStdout(result.stdout) as ImportPayload;
      const escapePath = path.join(root, 'docs/escape/bp-td-001.md');

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.ok(entryFindingCodes(payload, 'BP-TD-001').includes('import.path.probe_failed'));
      assert.strictEqual(await pathExists(escapePath), false);
    });
  });

  it('rolls back only its own creates and leaves a colliding file intact on no-clobber failure', async () => {
    await withTempRepo(importRepoOptions, async (root) => {
      const services = await loadAppServices({ cwd: root });
      const collidingPath = 'tech-debt/open/bp-td-002.md';
      // A file another writer created after preflight, hidden from this import's preflight.
      await services.store.createRecord(
        collidingPath,
        techDebtRecord(2, 'Foreign writer record', '2026-06-01T00:00:00Z'),
      );
      const manifest = await loadManifestFor(root, [
        openEntry(1, 'TD-001'),
        openEntry(2, 'TD-002'),
      ]);
      const error = await captureError(
        runImportService({
          dryRun: false,
          importedAt: '2026-06-13T00:00:00Z',
          manifest,
          repo: services.repo,
          store: racingStore(services.store, collidingPath),
          validationContext: validationContextFor(services.repo),
        }),
      );

      assert.ok(error instanceof IntrospectionError);
      assert.strictEqual(error.code, 'import.write_failed');
      assert.strictEqual(await pathExists(recordsPath(root, 'tech-debt/open/bp-td-001.md')), false);
      assert.match(await readFileText(recordsPath(root, collidingPath)), /Foreign writer record/u);
    });
  });
});
