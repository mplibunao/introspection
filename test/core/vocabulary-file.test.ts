/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { loadVocabularyFile } from '../../src/config/repo-context.js';
import type { IntrospectionVocabulary, VocabularyTerm } from '../../src/config/repo-context.js';
import { proposeVocabularyTerm } from '../../src/core/vocabulary.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';

const timestamp = '2026-06-10T00:00:00Z';

type VocabularyServiceContext = Parameters<typeof proposeVocabularyTerm>[0]['context'] &
  Readonly<{ vocabulary: IntrospectionVocabulary }>;

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-vocabulary-file-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const noRefVocabularyTerm: VocabularyTerm = {
  tag: 'owner/mp',
  status: 'approved',
  description: 'Human-managed owner tag with no traceable source to cite.',
  provenance: { kind: 'human', noted_at: timestamp },
};

const seedableVocabulary = (terms: ReadonlyArray<VocabularyTerm>): IntrospectionVocabulary => ({
  schema_version: 1,
  terms,
});

const contextFor = (root: string): VocabularyServiceContext => ({
  locksRoot: path.join(root, '.introspection/.locks'),
  recordsRoot: path.join(root, 'docs/records'),
  vocabulary: seedableVocabulary([noRefVocabularyTerm]),
  vocabularyPath: path.join(root, '.introspection/vocabulary.toml'),
});

const seedVocabularyFile = async (context: VocabularyServiceContext): Promise<void> => {
  await mkdir(path.dirname(context.vocabularyPath), { recursive: true });
  await writeFile(context.vocabularyPath, renderVocabularyToml(context.vocabulary));
};

const assertNoRefTermRoundTripped = (
  tomlContent: string,
  reloadedTerm: VocabularyTerm | null,
): void => {
  // Writing `ref = undefined` is invalid TOML; the serializer must omit the key entirely
  assert.notMatch(tomlContent, /ref = undefined/u);
  assert.notMatch(tomlContent, /^\s*ref\s*=\s*$/mu);
  assert.ok(reloadedTerm, 'no-ref term must survive round-trip reload');
  assert.ok(!('ref' in reloadedTerm.provenance), 'reloaded provenance must not carry a ref key');
};

describe('vocabulary-file provenance serialization', () => {
  it('round-trips a no-ref provenance term through a real write+reload without emitting ref = undefined', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await seedVocabularyFile(context);
      await proposeVocabularyTerm({
        context,
        term: {
          tag: 'topic/new',
          description: 'Proposed during no-ref round-trip regression test.',
          provenance: { kind: 'human' },
        },
      });
      const tomlContent = await readFile(context.vocabularyPath, 'utf8');
      const reloaded = await loadVocabularyFile(context.vocabularyPath);
      const match = reloaded.terms.find((candidate) => candidate.tag === 'owner/mp') ?? null;
      assertNoRefTermRoundTripped(tomlContent, match);
    });
  });
});
