import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { isoTimestamp } from '../../src/core/time.js';
import { expectedMachineTags } from '../../src/core/validation.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import { parseMarkdownRecord } from '../../src/store/frontmatter.js';
import { now, parseJsonStdout, run, term, withTempRepo } from '../fixtures/cli-repo-fixture.js';

// Resolved at import time so the guard test does not need async file I/O.
const recordCommandSourcePath = new URL('../../src/cli/commands/record/create.ts', import.meta.url)
  .pathname;

const recordCreateRepoOptions = {
  tmpDirPrefix: 'introspection-record-create-',
  vocabularyTerms: [term('owner/mp'), term('topic/records')],
} as const;

/*
 * Extracts top-level YAML key names in document order. Only lines that start at
 * column 0 with a lowercase-letter/underscore key followed by a colon are
 * matched; indented mapping keys and list items are excluded.
 */
const yamlTopLevelKeys = (yamlText: string): ReadonlyArray<string> =>
  yamlText
    .split('\n')
    .filter((line) => /^[a-z_]+:/u.test(line))
    .map((line) => (line.split(':')[0] ?? '').trimEnd());

describe('record create tech-debt CLI command', () => {
  it('creates a record with correct id, frontmatter field order, tag order, source, body, and no resolution', async () => {
    await withTempRepo(recordCreateRepoOptions, async (root) => {
      const result = await run(root, [
        'record',
        'create',
        'tech-debt',
        '--title',
        'Future stack-neutral React preset',
        '--problem',
        'The preset is React-specific.',
        '--why-deferred',
        'The current phase has a smaller scope.',
        '--revisit-trigger',
        'Revisit when a second framework adopts it.',
        '--done-when',
        'A second framework uses the preset.',
        '--source-kind',
        'plan',
        '--source-ref',
        'docs/exec-plans/example.md',
        '--tag',
        'owner/mp',
        '--tag',
        'topic/records',
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 0, `CLI failed with: ${result.stdout}`);

      // CLI JSON output: id and path are summary-only, not full frontmatter
      const payload = parseJsonStdout(result.stdout) as {
        ok: boolean;
        record: { id: string; path: string };
      };
      assert.strictEqual(payload.ok, true);
      assert.strictEqual(payload.record.id, 'BP-TD-001');
      assert.strictEqual(payload.record.path, 'tech-debt/open/bp-td-001.md');

      // Read raw file to characterize what was actually written to disk
      const rawMarkdown = await readFile(
        path.join(root, 'docs/records/tech-debt/open/bp-td-001.md'),
        'utf8',
      );
      const frontmatterMatch = /^---\n([\s\S]*?)\n---\n/u.exec(rawMarkdown);
      assert.ok(frontmatterMatch !== null, 'Raw markdown must contain a frontmatter block');
      // Index [1] is the first capture group; TypeScript types it string | undefined.
      // @effect/vitest assert.ok is an assertion function so TypeScript narrows above.
      const rawFrontmatter = frontmatterMatch[1] ?? '';

      // Frontmatter field order is load-bearing: renderMarkdownRecord uses insertion
      // Order so any reordering silently changes the on-disk format.
      assert.deepStrictEqual(yamlTopLevelKeys(rawFrontmatter), [
        'schema_version',
        'id',
        'repo_key',
        'record_type',
        'number',
        'title',
        'status',
        'type',
        'category',
        'visibility',
        'created_at',
        'updated_at',
        'tags',
        'source',
      ]);

      // Parse the written record for typed assertions
      const record = parseMarkdownRecord(rawMarkdown, 'tech-debt/open/bp-td-001.md');
      const { frontmatter } = record;

      // Tag order: machine tags first (in derivedTags order), user tags second, deduped
      const ts = isoTimestamp(now);
      assert.deepStrictEqual(
        [...frontmatter.tags],
        [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
          'topic/records',
        ],
      );

      // Source block shape
      assert.deepStrictEqual(frontmatter.source, {
        discovered_at: ts,
        refs: [{ kind: 'plan', ref: 'docs/exec-plans/example.md' }],
      });

      // Open records must have no resolution field
      assert.ok(!('resolution' in frontmatter), 'Open record must not have a resolution field');

      // Body text: exact match proves heading order, spacing, and trailing newline are stable
      assert.strictEqual(
        record.body,
        [
          '## Problem',
          '',
          'The preset is React-specific.',
          '',
          '## Why deferred',
          '',
          'The current phase has a smaller scope.',
          '',
          '## Revisit trigger',
          '',
          'Revisit when a second framework adopts it.',
          '',
          '## Done when',
          '',
          'A second framework uses the preset.',
          '',
        ].join('\n'),
      );
    });
  });

  it('machine tags prefix matches expectedMachineTags and user tags follow after dedupe', async () => {
    // Drift guard: proves record create uses expectedMachineTags order rather than a local literal.
    // A user tag that duplicates a machine tag must not appear twice.
    await withTempRepo(recordCreateRepoOptions, async (root) => {
      const result = await run(root, [
        'record',
        'create',
        'tech-debt',
        '--title',
        'Drift guard test',
        '--problem',
        'Machine tag order must match expectedMachineTags.',
        '--why-deferred',
        'Needed to prove tag derivation is centralized.',
        '--revisit-trigger',
        'Revisit if expectedMachineTags is changed.',
        '--tag',
        'owner/mp',
        '--tag',
        'status/open', // Duplicate of machine tag — must be deduped
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 0, `CLI failed with: ${result.stdout}`);

      const rawMarkdown = await readFile(
        path.join(root, 'docs/records/tech-debt/open/bp-td-001.md'),
        'utf8',
      );
      const record = parseMarkdownRecord(rawMarkdown, 'tech-debt/open/bp-td-001.md');
      const { frontmatter } = record;

      // Compute authoritative machine tags from the written record
      const machineTagContext = {
        repoKey: frontmatter.repo_key,
        repoSlug: 'backpressure',
        defaultVisibility: frontmatter.visibility,
      };
      const machineTags = expectedMachineTags(techDebtRecordType, record, machineTagContext);

      // Machine tags must be a prefix of the actual tags
      assert.deepStrictEqual(
        [...frontmatter.tags].slice(0, machineTags.length),
        [...machineTags],
        'record create must produce machine tags in expectedMachineTags order',
      );

      // User tag 'owner/mp' must appear after machine tags
      const ownerTagIndex = frontmatter.tags.indexOf('owner/mp');
      assert.ok(ownerTagIndex >= machineTags.length, 'user tags must follow machine tags');

      // Duplicate machine tag from user input must not appear twice
      const statusTagCount = frontmatter.tags.filter((tag) => tag === 'status/open').length;
      assert.strictEqual(statusTagCount, 1, 'duplicate machine tag from --tag must be deduped');
    });
  });

  it('source guard: record create does not hardcode machine-tag template literals', async () => {
    // Guards against regression where the local tag literal is restored instead
    // Of keeping expectedMachineTags as the single source of truth for machine tags.
    const source = await readFile(recordCommandSourcePath, 'utf8');

    // These template-literal patterns appeared in the old hardcoded tag array.
    // They must not re-appear inside the create path.
    assert.ok(
      // eslint-disable-next-line no-template-curly-in-string
      !source.includes('`repo/${context.repoSlug}`'),
      // eslint-disable-next-line no-template-curly-in-string
      'techDebtFrontmatter must not hardcode `repo/${context.repoSlug}` — use expectedMachineTags',
    );
    assert.ok(
      // eslint-disable-next-line no-template-curly-in-string
      !source.includes('`visibility/${context.defaultVisibility}`'),
      // eslint-disable-next-line no-template-curly-in-string
      'techDebtFrontmatter must not hardcode `visibility/${context.defaultVisibility}` — use expectedMachineTags',
    );
  });
});
