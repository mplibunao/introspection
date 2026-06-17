import { assert, describe, it } from '@effect/vitest';

import {
  rawVocabularyTags,
  tagConformsToGrammar,
  tagHasNamespace,
  tagIsMachineOwned,
} from '../../src/core/tags.js';

describe('tag grammar', () => {
  it('accepts the GNO-compatible hierarchical tag grammar', () => {
    assert.strictEqual(tagConformsToGrammar('owner/mp'), true);
    assert.strictEqual(tagConformsToGrammar('topic/mutation-testing'), true);
    assert.strictEqual(tagConformsToGrammar('area/linting.v2'), true);
  });

  it('rejects partial matches and malformed hierarchy separators', () => {
    assert.strictEqual(tagConformsToGrammar('prefix owner/mp'), false);
    assert.strictEqual(tagConformsToGrammar('owner/mp suffix'), false);
    assert.strictEqual(tagConformsToGrammar('owner/mp/topic'), true);
    assert.strictEqual(tagConformsToGrammar('ownermptopic'), true);
    assert.strictEqual(tagConformsToGrammar('owner//mp'), false);
    assert.strictEqual(tagConformsToGrammar('owner/-mp'), false);
  });
});

describe('machine-owned tag helpers', () => {
  it('separates machine-owned derived tags from raw vocabulary tags', () => {
    const tags = [
      'record/tech-debt',
      'repo/introspection',
      'status/open',
      'visibility/local-only',
      'owner/mp',
      'topic/mutation-testing',
    ];

    assert.deepStrictEqual(rawVocabularyTags(tags), ['owner/mp', 'topic/mutation-testing']);
    assert.strictEqual(tagIsMachineOwned('status/open'), true);
    assert.strictEqual(tagIsMachineOwned('owner/mp'), false);
    assert.strictEqual(tagHasNamespace('owner/mp', 'owner'), true);
    assert.strictEqual(tagHasNamespace('team/owner/mp', 'owner'), false);
  });
});
