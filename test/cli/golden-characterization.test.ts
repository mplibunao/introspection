import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';
import { assertGoldenJson } from '../fixtures/golden.js';
import {
  parseJsonStdout,
  run,
  seedRecords,
  techDebtRecord,
  term,
  withTempRepo,
} from '../fixtures/cli-repo-fixture.js';

/*
 * IX-SR-01 characterization safety net.
 *
 * These goldens pin the CURRENT plain-TypeScript CLI's --json output for every
 * command the substrate reshape will re-implement on Effect (IX-SR-02 onward).
 * Each later cutover item must reproduce these captured bytes, so a behavior
 * drift surfaces as a golden diff rather than going unnoticed.
 *
 * Scope note: goldens cover the machine-facing --json contract only. Human
 * presenter output keeps its existing assertion-based coverage in
 * prime.test.ts / records.test.ts; pinning formatted prose here would add churn
 * without protecting the contract that downstream agents consume.
 *
 * The fixture is backpressure-shaped on purpose: schema_version = 1, repo_key
 * "BP", a docs/records root, and 5/20 list limits, with NO [[records.types]]
 * block. That makes the suite double as the records-only adoption proof the
 * plan asks for: today's implicit tech-debt default still validates a real
 * adopter, which IX-SR-04 must preserve additively and IX-SR-15 cuts over.
 */

const backpressureRepoOptions = {
  tmpDirPrefix: 'introspection-golden-bp-',
  vocabularyTerms: [term('owner/mp'), term('topic/records')],
  policyDocs: true,
  recordListLimits: { defaultLimit: 5, hardLimit: 20 },
} as const;

const emptyRepoOptions = {
  tmpDirPrefix: 'introspection-golden-empty-',
  vocabularyTerms: [term('owner/mp')],
} as const;

const createRecordArgs = (title: string): ReadonlyArray<string> => [
  'record',
  'create',
  'tech-debt',
  '--title',
  title,
  '--problem',
  'The reshape needs a captured baseline for record creation output.',
  '--why-deferred',
  'The Effect cutover must reproduce this exact JSON summary.',
  '--revisit-trigger',
  'Revisit when record creation output changes.',
  '--source-ref',
  'docs/design-input/introspection-seed-2026-06-01.md',
  '--source-kind',
  'plan',
];

const importSections = (): ReadonlyArray<{ readonly heading: string; readonly body: string }> => [
  { heading: '## Problem', body: 'The legacy tracker entry needs a record home.' },
  { heading: '## Why deferred', body: 'The import path is being characterized before cutover.' },
  { heading: '## Revisit trigger', body: 'Revisit when import output shape changes.' },
];

interface ListPayload {
  readonly list: {
    readonly totalMatchingRecordCount: number;
    readonly records: ReadonlyArray<{ readonly id: string; readonly status: string }>;
  };
}

interface ExportManifestEntry {
  readonly kind: string;
  readonly record_count: number;
}

interface ExportPayload {
  readonly export: {
    readonly recordsExported: number;
    readonly manifest: { readonly exports: ReadonlyArray<ExportManifestEntry> };
  };
}

/*
 * Recursively count markdown files so the export artifact check can confirm the
 * GNO projection on disk matches the manifest's declared record_count, not just
 * the JSON summary the command printed.
 */
const countMarkdownFiles = async (directory: string): Promise<number> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return countMarkdownFiles(entryPath);
      }

      if (entry.isFile() && path.extname(entry.name) === '.md') {
        return 1;
      }

      return 0;
    }),
  );

  return counts.reduce((sum, count) => sum + count, 0);
};

const importManifest = {
  schema_version: 1,
  record_type: 'tech-debt',
  id_policy: 'preserve',
  source: {
    tracker_path: 'docs/exec-plans/tech-debt-tracker.md',
    discovered_at: '2026-06-10T00:00:00Z',
  },
  entries: [
    {
      number: 7,
      legacy_id: 'TD-007',
      title: 'Active follow-up TD-007',
      status: 'open',
      sections: importSections(),
    },
    {
      number: 1,
      legacy_id: 'TD-001',
      title: 'Rejected item TD-001',
      status: 'rejected',
      sections: importSections(),
      resolution: { rationale: 'The direction was settled elsewhere, so this is closed.' },
    },
    {
      number: 2,
      legacy_id: 'TD-002',
      title: 'Superseded item TD-002',
      status: 'superseded',
      sections: importSections(),
      resolution: {
        rationale: 'Ownership moved to a design doc.',
        evidence_refs: [{ kind: 'doc', ref: 'docs/design-docs/rule-intake.md' }],
      },
    },
  ],
};

describe('CLI golden characterization (pre-cutover baseline)', () => {
  describe('backpressure-shaped records-only adoption', () => {
    it('check passes for an empty records-only repo', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        const result = await run(root, ['check', '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          ok: boolean;
          checkedRecordCount: number;
          findings: ReadonlyArray<unknown>;
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.checkedRecordCount, 0);
        assert.strictEqual(payload.findings.length, 0);
        await assertGoldenJson({ name: 'check-empty', result, root });
      });
    });

    it('check passes for a populated records-only repo (implicit tech-debt default)', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, ['check', '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          ok: boolean;
          checkedRecordCount: number;
        };

        /*
         * Records-only adoption proof: a schema-v1 repo with no [[records.types]]
         * declaration validates its tech-debt records clean today. IX-SR-04 must
         * keep this green additively; IX-SR-15 removes the implicit default.
         */
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.checkedRecordCount, 3);
        await assertGoldenJson({ name: 'check-populated', result, root });
      });
    });

    it('prime orients a records-only repo from frontmatter', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, ['prime', '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          orientation: { totalRecordCount: number; unreadableRecordCount: number };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.orientation.totalRecordCount, 3);
        assert.strictEqual(payload.orientation.unreadableRecordCount, 0);
        await assertGoldenJson({ name: 'prime', result, root });
      });
    });

    it('records list returns active records by default', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, ['records', 'list', '--json']);
        const payload = parseJsonStdout(result.stdout) as ListPayload;

        assert.strictEqual(result.exitCode, 0);
        // Default view shows active records only, within the configured limit, in the CLI's current output order.
        assert.strictEqual(payload.list.totalMatchingRecordCount, 2);
        assert.deepStrictEqual(
          payload.list.records.map((record) => record.id),
          ['BP-TD-001', 'BP-TD-002'],
        );
        assert.ok(payload.list.records.every((record) => record.status === 'open'));
        await assertGoldenJson({ name: 'records-list-default', result, root });
      });
    });

    it('records list --all includes terminal records', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, ['records', 'list', '--all', '--json']);
        const payload = parseJsonStdout(result.stdout) as ListPayload;

        assert.strictEqual(result.exitCode, 0);
        // --all includes the terminal record alongside the two active ones.
        assert.strictEqual(payload.list.totalMatchingRecordCount, 3);
        assert.deepStrictEqual(
          payload.list.records.map((record) => record.id),
          ['BP-TD-003', 'BP-TD-001', 'BP-TD-002'],
        );
        await assertGoldenJson({ name: 'records-list-all', result, root });
      });
    });

    it('export writes a JSON and GNO bundle with a stable manifest', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, ['export', '--json']);
        const payload = parseJsonStdout(result.stdout) as ExportPayload;

        assert.strictEqual(result.exitCode, 0);
        // Semantic pin: both formats present, three records exported.
        assert.deepStrictEqual(
          payload.export.manifest.exports.map((entry) => entry.kind),
          ['json', 'gno-markdown'],
        );
        assert.strictEqual(payload.export.recordsExported, 3);

        /*
         * Artifact pin: the JSON summary is not enough. The files must exist on
         * disk and their counts must match the manifest the command reported.
         */
        const generatedRoot = path.join(root, '.introspection/generated');
        const manifestOnDisk = JSON.parse(
          await readFile(path.join(generatedRoot, 'manifest.json'), 'utf8'),
        ) as { exports: ReadonlyArray<ExportManifestEntry> };
        const recordsOnDisk = JSON.parse(
          await readFile(path.join(generatedRoot, 'records.json'), 'utf8'),
        ) as { records: ReadonlyArray<unknown> };
        const gnoMarkdownFileCount = await countMarkdownFiles(
          path.join(generatedRoot, 'gno-markdown'),
        );
        const jsonEntry = manifestOnDisk.exports.find((entry) => entry.kind === 'json');
        const gnoEntry = manifestOnDisk.exports.find((entry) => entry.kind === 'gno-markdown');

        assert.strictEqual(manifestOnDisk.exports.length, 2);
        assert.strictEqual(recordsOnDisk.records.length, 3);
        assert.strictEqual(recordsOnDisk.records.length, jsonEntry?.record_count);
        assert.strictEqual(gnoMarkdownFileCount, 3);
        assert.strictEqual(gnoMarkdownFileCount, gnoEntry?.record_count);
        await assertGoldenJson({ name: 'export', result, root });
      });
    });
  });

  describe('record mutation commands', () => {
    it('record create tech-debt allocates the first ID', async () => {
      await withTempRepo(emptyRepoOptions, async (root) => {
        const result = await run(root, [...createRecordArgs('Baseline created record'), '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          record: { id: string; status: string; path: string };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.record.id, 'BP-TD-001');
        assert.strictEqual(payload.record.status, 'open');
        assert.strictEqual(payload.record.path, 'tech-debt/open/bp-td-001.md');
        await assertGoldenJson({ name: 'record-create', result, root });
      });
    });

    it('record transition moves an open record to a terminal status', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        await seedRecords(root);
        const result = await run(root, [
          'record',
          'transition',
          'tech-debt/open/bp-td-001.md',
          'done',
          '--rationale',
          'The transition has concrete evidence for the captured baseline.',
          '--evidence-kind',
          'doc',
          '--evidence-ref',
          'docs/design-input/introspection-seed-2026-06-01.md',
          '--json',
        ]);
        const payload = parseJsonStdout(result.stdout) as {
          transition: { id: string; status: string; path: string };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.transition.id, 'BP-TD-001');
        assert.strictEqual(payload.transition.status, 'done');
        assert.strictEqual(payload.transition.path, 'tech-debt/done/bp-td-001.md');
        await assertGoldenJson({ name: 'record-transition', result, root });
      });
    });

    it('ids repair reassigns a duplicate record ID', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        /*
         * Seed two records sharing BP-TD-100 directly through the store so the
         * corpus holds a genuine duplicate; the allocator hands the repaired
         * record the next free number (BP-TD-101).
         */
        const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
        await store.createRecord(
          'tech-debt/open/bp-td-100.md',
          techDebtRecord(100, 'Original record', '2026-06-01T00:00:00Z'),
        );
        await store.createRecord(
          'tech-debt/open/duplicate.md',
          techDebtRecord(100, 'Duplicate record', '2026-06-01T00:00:00Z'),
        );
        const result = await run(root, ['ids', 'repair', 'tech-debt/open/duplicate.md', '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          repair: { oldId: string; newId: string };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.repair.oldId, 'BP-TD-100');
        assert.strictEqual(payload.repair.newId, 'BP-TD-101');
        await assertGoldenJson({ name: 'ids-repair', result, root });
      });
    });
  });

  describe('import command', () => {
    it('imports a preserve-policy manifest into records', async () => {
      await withTempRepo(backpressureRepoOptions, async (root) => {
        const manifestPath = path.join(root, 'import-manifest.json');
        await writeFile(manifestPath, JSON.stringify(importManifest, null, 2));
        const result = await run(root, ['import', '--manifest', manifestPath, '--json']);
        const payload = parseJsonStdout(result.stdout) as {
          ok: boolean;
          import: {
            written: boolean;
            entries: ReadonlyArray<{ record_id: string; status: string }>;
          };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.import.written, true);
        assert.deepStrictEqual(
          payload.import.entries.map((entry) => entry.record_id),
          ['BP-TD-007', 'BP-TD-001', 'BP-TD-002'],
        );
        assert.deepStrictEqual(
          payload.import.entries.map((entry) => entry.status),
          ['open', 'rejected', 'superseded'],
        );
        await assertGoldenJson({ name: 'import', result, root });
      });
    });
  });
});
