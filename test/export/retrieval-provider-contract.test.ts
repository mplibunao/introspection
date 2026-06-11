/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { assert, describe, it } from '@effect/vitest';

import { createDeterministicRetrievalProvider } from '../../src/retrieval/deterministic-provider.js';
import { createGnoRetrievalAdapter } from '../../src/retrieval/gno-adapter.js';
import type { GnoSearchClient, GnoSearchHit } from '../../src/retrieval/gno-adapter.js';
import type {
  RetrievalDocument,
  RetrievalProvider,
} from '../../src/retrieval/retrieval-provider.js';

const documents: ReadonlyArray<RetrievalDocument> = [
  {
    id: 'BP-TD-002',
    path: 'tech-debt/open/bp-td-002.md',
    text: 'Export projection should stay recreatable.',
    tags: ['record/tech-debt', 'topic/export'],
    visibility: 'local-only',
  },
  {
    id: 'BP-TD-001',
    path: 'tech-debt/open/bp-td-001.md',
    text: 'Export projection should stay recreatable.',
    tags: ['record/tech-debt', 'topic/export', 'owner/mp'],
    visibility: 'local-only',
  },
  {
    id: 'BP-TD-003',
    path: 'tech-debt/open/bp-td-003.md',
    text: 'Unrelated retrieval content.',
    tags: ['record/tech-debt', 'topic/other'],
    visibility: 'local-only',
  },
];

const gnoHits = (): ReadonlyArray<GnoSearchHit> =>
  documents.map((document) => ({
    id: document.id,
    path: document.path,
    tags: document.tags,
    text: document.text,
    visibility: document.visibility,
  }));

const gnoClient = (): GnoSearchClient => ({
  search: async (): Promise<ReadonlyArray<GnoSearchHit>> => gnoHits(),
});

const providerCases: ReadonlyArray<[string, RetrievalProvider]> = [
  ['deterministic', createDeterministicRetrievalProvider(documents)],
  ['gno adapter', createGnoRetrievalAdapter(gnoClient())],
];

describe('WI-11 RetrievalProvider contract', () => {
  it.each(providerCases)(
    '%s returns deterministic, limited, tag-filtered results',
    async (providerName, provider) => {
      const results = await provider.search({
        text: 'recreatable',
        limit: 1,
        tagsAll: ['topic/export'],
        tagsAny: ['owner/mp', 'topic/missing'],
      });

      assert.strictEqual(providerName.length > 0, true);
      assert.deepStrictEqual(
        results.map((result) => result.document.id),
        ['BP-TD-001'],
      );
      assert.strictEqual(results[0]?.score, 1);
    },
  );

  it.each(providerCases)(
    '%s returns no results for non-matching query text',
    async (providerName, provider) => {
      const results = await provider.search({ text: 'missing phrase' });

      assert.strictEqual(providerName.length > 0, true);
      assert.deepStrictEqual(results, []);
    },
  );
});
