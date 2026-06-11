import { assert, describe, it } from '@effect/vitest';

import { version } from '../src/index.js';

describe('WI-01 scaffold', () => {
  it('exports the package version used by the placeholder CLI', () => {
    assert.strictEqual(version, '0.0.0');
  });
});
