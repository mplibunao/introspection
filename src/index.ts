export const version = '0.0.0';

export type {
  BaseRecordFrontmatter,
  ConversionTarget,
  ConversionTargetKind,
  EvidenceRef,
  EvidenceRefKind,
  ExportDocument,
  Finding,
  FindingSeverity,
  JsonSchemaDocument,
  LifecycleDefinition,
  LifecycleEvidenceRequirement,
  LifecycleStatusDefinition,
  LifecycleStatusKind,
  LifecycleTransitionDefinition,
  ParsedRecord,
  PrimeSummary,
  RecordType,
  RecordTypeRegistry,
  Resolution,
  SourceBlock,
  ValidationContext,
  Visibility,
} from './core/record-type.js';
export {
  createRecordTypeRegistry,
  validateLifecycleEvidence,
  validateTransition,
} from './core/record-type.js';
export {
  checkRecordResults,
  checkRecords,
  correctedMachineTags,
  expectedMachineTags,
  tagIsMachineOwned,
} from './core/validation.js';
export type { CheckFinding, CheckFindingSource, CheckReport } from './core/validation.js';
export { recordTypeRegistry } from './record-types/registry.js';
export { techDebtRecordType } from './record-types/tech-debt.js';
