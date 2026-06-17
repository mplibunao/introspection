import type {
  BaseRecordFrontmatter,
  Finding,
  ParsedRecord,
  RecordType,
} from './record-type-types.js';
import {
  validateLifecycleEvidence,
  validateTransition,
  validateTransitionEvidence,
} from './record-type.js';

const terminalStatuses = (recordType: RecordType): ReadonlyArray<string> =>
  Object.entries(recordType.lifecycle.statuses)
    .filter(([, status]) => status.kind === 'terminal')
    .map(([status]) => status);

const statusIsTerminal = (recordType: RecordType, status: string): boolean =>
  recordType.lifecycle.statuses[status]?.kind === 'terminal';

const validateRecordLifecycle = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => validateLifecycleEvidence(recordType, record);

export {
  statusIsTerminal,
  terminalStatuses,
  validateLifecycleEvidence,
  validateRecordLifecycle,
  validateTransition,
  validateTransitionEvidence,
};
