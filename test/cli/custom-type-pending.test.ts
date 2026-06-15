import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, describe, it } from '@effect/vitest';

import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import type { IntrospectionVocabulary } from '../../src/config/repo-context.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';
import { assertGoldenJson } from '../fixtures/golden.js';
import { parseJsonStdout, run, term, withTempRepo } from '../fixtures/cli-repo-fixture.js';

/*
 * Custom-type fixture for IX-SR-01.
 *
 * The reshape's headline capability is host-declared types as DATA: a repo opts
 * into a record type through config plus a manifest file, with no edits to
 * introspection source (IX-SR-04 config v2, IX-SR-05 manifest loader, IX-SR-06
 * manifest compiler). None of that exists yet.
 *
 * This file is honest about that in two ways:
 *   1. A non-skipped golden pins TODAY's behavior — an unregistered type is
 *      rejected with `record_type.unsupported`, and the remediation literally
 *      tells the author to edit the static registry. That is exactly the
 *      limitation the cutover removes, so the golden is a real before/after pin.
 *   2. A skipped test documents the DESIRED manifest-driven adoption. It is
 *      skipped (never executed) so it cannot masquerade as a passing feature; it
 *      exists as an executable spec the dependent items must turn green.
 */

const decisionRepoOptions = {
  tmpDirPrefix: 'introspection-custom-type-',
  vocabularyTerms: [term('owner/mp')],
} as const;

const decisionManifestFixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/custom-type/decision.record-type.toml',
);

const decisionRecord: ParsedRecord = {
  frontmatter: {
    schema_version: 1,
    id: 'BP-DEC-001',
    repo_key: 'BP',
    record_type: 'decision',
    number: 1,
    title: 'Adopt the manifest-declared decision type',
    status: 'open',
    type: 'introspection-record',
    category: 'decision',
    visibility: 'local-only',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    tags: ['record/decision', 'repo/backpressure', 'status/open', 'visibility/local-only'],
  },
  body: [
    'Adopt the manifest-declared decision type summary.',
    '## Context',
    'The substrate reshape introduces data-only custom record types.',
    '## Decision',
    'Declare the decision type through a manifest instead of editing source.',
    '## Consequences',
    'Custom types must compile through the manifest engine before this validates.',
  ].join('\n\n'),
};

const decisionVocabulary: IntrospectionVocabulary = {
  schema_version: 1,
  terms: [term('owner/mp')],
};

describe('custom record type — current behavior (not yet supported)', () => {
  it('rejects a record whose type is not in the static registry', async () => {
    await withTempRepo(decisionRepoOptions, async (root) => {
      const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
      await store.createRecord('decision/open/bp-dec-001.md', decisionRecord);
      const result = await run(root, ['check', '--json']);
      const payload = parseJsonStdout(result.stdout) as {
        ok: boolean;
        findings: ReadonlyArray<{ code: string }>;
      };

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(payload.ok, false);
      assert.ok(payload.findings.some((finding) => finding.code === 'record_type.unsupported'));
      /*
       * With --json the failing check routes its report to stdout; assertGoldenJson
       * pins stderr === '' so the exit-1 path stays free of diagnostic noise.
       */
      await assertGoldenJson({ name: 'custom-type-unsupported', result, root });
    });
  });
});

describe('custom record type — desired manifest behavior (IX-SR-04..06)', () => {
  /*
   * SKIPPED: documents the target adoption flow, which does not work yet. A repo
   * opts into the `decision` type purely through config v2 plus a manifest file;
   * introspection compiles it and check/list/export treat decision records as
   * first-class, with zero edits to src/record-types/registry.ts. Unskip this
   * once IX-SR-04 (config v2), IX-SR-05 (manifest loader), and IX-SR-06 (manifest
   * compiler) land.
   */
  it.skip('recognizes a repo-declared custom manifest type without source edits', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-custom-type-future-'));

    try {
      await mkdir(path.join(root, '.introspection/types'), { recursive: true });
      await mkdir(path.join(root, 'docs/records'), { recursive: true });
      /*
       * Config v2: every managed type is declared explicitly. A shipped preset
       * and a host manifest compile through the same engine.
       */
      await writeFile(
        path.join(root, '.introspection/config.toml'),
        [
          'schema_version = 2',
          'repo_key = "BP"',
          'repo_slug = "backpressure"',
          '',
          '[records]',
          'root = "docs/records"',
          '',
          '[defaults]',
          'visibility = "local-only"',
          '',
          '[[records.types]]',
          'use = "preset:tech-debt"',
          '',
          '[[records.types]]',
          'manifest = ".introspection/types/decision.record-type.toml"',
          '',
        ].join('\n'),
      );
      await writeFile(
        path.join(root, '.introspection/vocabulary.toml'),
        renderVocabularyToml(decisionVocabulary),
      );
      await writeFile(
        path.join(root, '.introspection/types/decision.record-type.toml'),
        await readFile(decisionManifestFixturePath, 'utf8'),
      );
      const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
      await store.createRecord('decision/open/bp-dec-001.md', decisionRecord);

      const checkResult = await run(root, ['check', '--json']);
      const checkPayload = parseJsonStdout(checkResult.stdout) as {
        ok: boolean;
        checkedRecordCount: number;
      };

      assert.strictEqual(checkResult.exitCode, 0);
      assert.strictEqual(checkPayload.ok, true);
      assert.strictEqual(checkPayload.checkedRecordCount, 1);

      const listResult = await run(root, ['records', 'list', '--all', '--json']);
      const listPayload = parseJsonStdout(listResult.stdout) as {
        list: { records: ReadonlyArray<{ id: string }> };
      };

      assert.strictEqual(listResult.exitCode, 0);
      assert.ok(listPayload.list.records.some((record) => record.id === 'BP-DEC-001'));

      const exportResult = await run(root, ['export', '--format', 'json', '--json']);

      assert.strictEqual(exportResult.exitCode, 0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
