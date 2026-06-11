import { createRecordTypeRegistry } from '../core/record-type.js';
import type { RecordType } from '../core/record-type-types.js';

import { techDebtRecordType } from './tech-debt.js';

const staticRecordTypes: ReadonlyArray<RecordType> = Object.freeze([techDebtRecordType]);
const recordTypeRegistry = createRecordTypeRegistry(staticRecordTypes);

export { recordTypeRegistry };
