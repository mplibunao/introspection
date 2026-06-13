import type {
  BaseRecordFrontmatter,
  Finding,
  LifecycleStatusKind,
  ParsedRecord,
  RecordType,
  RecordTypeRegistry,
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

/*
 * Pure metadata read: resolves the lifecycle kind for a (recordType, status) pair
 * from the registry without touching record bodies or validation context.
 */
const lifecycleStatusKindFor = (
  registry: RecordTypeRegistry,
  recordType: string,
  status: string,
): LifecycleStatusKind | 'unknown' =>
  registry.get(recordType)?.lifecycle.statuses[status]?.kind ?? 'unknown';

const validateRecordLifecycle = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => validateLifecycleEvidence(recordType, record);

export {
  lifecycleStatusKindFor,
  statusIsTerminal,
  terminalStatuses,
  validateLifecycleEvidence,
  validateRecordLifecycle,
  validateTransition,
  validateTransitionEvidence,
};
