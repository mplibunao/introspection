import { assert, describe, it } from '@effect/vitest';

import { createRecordIdentity } from '../../src/core/id.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';

describe('createRecordIdentity', () => {
  it('produces the correct id, number, and path for an open tech-debt record', () => {
    const identity = createRecordIdentity({
      repoKey: 'BP',
      recordType: techDebtRecordType,
      number: 7,
      status: 'open',
    });

    assert.strictEqual(identity.id, 'BP-TD-007');
    assert.strictEqual(identity.number, 7);
    assert.strictEqual(identity.relativePath, 'tech-debt/open/bp-td-007.md');
  });

  it('uses the status in the path for a terminal tech-debt record', () => {
    const identity = createRecordIdentity({
      repoKey: 'BP',
      recordType: techDebtRecordType,
      number: 7,
      status: 'rejected',
    });

    assert.strictEqual(identity.id, 'BP-TD-007');
    assert.strictEqual(identity.number, 7);
    assert.strictEqual(identity.relativePath, 'tech-debt/rejected/bp-td-007.md');
  });
});
