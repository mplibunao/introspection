type JsonPrimitive = boolean | null | number | string;
type JsonArray = ReadonlyArray<JsonValue>;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
interface JsonObject {
  [key: string]: JsonValue | undefined;
}

type FindingSeverity = 'error' | 'warning';
type EvidenceRefKind = 'commit' | 'doc' | 'other' | 'plan' | 'record' | 'tracker' | 'url';
type ConversionTargetKind =
  | 'check'
  | 'doc'
  | 'global-instruction'
  | 'hook'
  | 'other'
  | 'record'
  | 'repo-instruction'
  | 'skill'
  | 'taste-card';
type Visibility = 'local-only';

interface Finding {
  readonly code: string;
  readonly severity: FindingSeverity;
  readonly message: string;
  readonly path?: ReadonlyArray<number | string>;
  readonly remediation?: string;
}

interface EvidenceRef extends JsonObject {
  readonly kind: EvidenceRefKind;
  readonly ref: string;
  readonly label?: string;
  readonly note?: string;
}

interface ConversionTarget extends JsonObject {
  readonly kind: ConversionTargetKind;
  readonly ref: string;
  readonly rationale: string;
}

interface Resolution extends JsonObject {
  readonly disposition: string;
  readonly resolved_at: string;
  readonly rationale: string;
  readonly evidence_refs?: ReadonlyArray<EvidenceRef>;
}

interface SourceBlock extends JsonObject {
  readonly discovered_at: string;
  // Refs is optional: organically-discovered debt has nothing real to cite
  readonly refs?: ReadonlyArray<EvidenceRef>;
}

interface BaseRecordFrontmatter extends JsonObject {
  readonly schema_version: number;
  readonly id: string;
  readonly repo_key: string;
  readonly record_type: string;
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly type: 'introspection-record';
  readonly category: string;
  readonly visibility: Visibility;
  readonly created_at: string;
  readonly updated_at: string;
  readonly tags: ReadonlyArray<string>;
  readonly conversion_targets?: ReadonlyArray<ConversionTarget>;
  readonly resolution?: Resolution;
  readonly source?: SourceBlock;
}

interface ParsedRecord<Frontmatter extends BaseRecordFrontmatter = BaseRecordFrontmatter> {
  readonly frontmatter: Frontmatter;
  readonly body: string;
  readonly path?: string;
}

interface ValidationVocabularyTerm {
  readonly tag: string;
  readonly status: 'approved' | 'provisional' | 'rejected';
  readonly aliases?: ReadonlyArray<string>;
  readonly applies_to?: ReadonlyArray<string>;
}

interface ValidationVocabulary {
  readonly terms: ReadonlyArray<ValidationVocabularyTerm>;
}

interface ValidationContext {
  readonly repoKey?: string;
  readonly repoSlug?: string;
  readonly recordsRoot?: string;
  readonly vocabulary?: ValidationVocabulary;
}

interface JsonSchemaDocument extends JsonObject {
  readonly $id?: string;
  readonly title?: string;
}

type LifecycleStatusKind = 'active' | 'terminal';

interface LifecycleEvidenceRequirement {
  readonly requiresResolution?: boolean;
  readonly requiresResolutionEvidenceRefs?: boolean;
  readonly requiresConversionTargets?: boolean;
}

interface LifecycleStatusDefinition {
  readonly kind: LifecycleStatusKind;
  readonly evidence?: LifecycleEvidenceRequirement;
  readonly allowsActiveResolution?: boolean;
}

interface LifecycleTransitionDefinition {
  readonly from: string;
  readonly to: string;
  readonly evidence?: LifecycleEvidenceRequirement;
}

interface LifecycleDefinition {
  readonly initialStatus: string;
  readonly statuses: Record<string, LifecycleStatusDefinition>;
  readonly transitions: ReadonlyArray<LifecycleTransitionDefinition>;
}

interface PrimeSummary {
  readonly id: string;
  readonly title: string;
  readonly recordType: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly summary: string;
  readonly tags: ReadonlyArray<string>;
}

interface ExportDocument {
  readonly schemaVersion: number;
  readonly id: string;
  readonly recordType: string;
  readonly status: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly tags: ReadonlyArray<string>;
  readonly frontmatter: BaseRecordFrontmatter;
  readonly body: string;
}

interface RecordType<Frontmatter extends BaseRecordFrontmatter = BaseRecordFrontmatter> {
  readonly key: Frontmatter['record_type'];
  readonly idPrefix: string;
  readonly schema: JsonSchemaDocument;
  readonly lifecycle: LifecycleDefinition;
  derivedTags(record: ParsedRecord<Frontmatter>, context: ValidationContext): ReadonlyArray<string>;
  validate(record: ParsedRecord<Frontmatter>, context: ValidationContext): ReadonlyArray<Finding>;
  summarizeForPrime(record: ParsedRecord<Frontmatter>, context: ValidationContext): PrimeSummary;
  projectForExport(record: ParsedRecord<Frontmatter>, context: ValidationContext): ExportDocument;
}

interface RecordTypeRegistry {
  readonly entries: () => ReadonlyArray<RecordType>;
  readonly keys: () => ReadonlyArray<string>;
  readonly get: (key: string) => RecordType | undefined;
  readonly require: (key: string) => RecordType;
}

const requireRecordType = (recordsByKey: Map<string, RecordType>, key: string): RecordType => {
  const recordType = recordsByKey.get(key);

  if (!recordType) {
    throw new Error(`Unknown record type: ${key}`);
  }

  return recordType;
};

const createRecordTypeRegistry = (recordTypes: ReadonlyArray<RecordType>): RecordTypeRegistry => {
  const recordsByKey = new Map<string, RecordType>();
  const recordsByIdPrefix = new Map<string, RecordType>();

  for (const recordType of recordTypes) {
    if (recordsByKey.has(recordType.key)) {
      throw new Error(`Duplicate record type registered: ${recordType.key}`);
    }

    if (recordsByIdPrefix.has(recordType.idPrefix)) {
      throw new Error(`Duplicate record type idPrefix registered: ${recordType.idPrefix}`);
    }

    recordsByKey.set(recordType.key, recordType);
    recordsByIdPrefix.set(recordType.idPrefix, recordType);
  }

  return {
    entries: () => Object.freeze([...recordsByKey.values()]),
    keys: () => Object.freeze([...recordsByKey.keys()]),
    get: (key) => recordsByKey.get(key),
    require: (key) => requireRecordType(recordsByKey, key),
  };
};

const hasItems = (items: ReadonlyArray<unknown> | undefined): boolean =>
  Array.isArray(items) && items.length > 0;

const unknownStatusFinding = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  status: string,
): Finding => ({
  code: 'lifecycle.status.unknown',
  severity: 'error',
  message: `Status "${status}" is not part of the ${recordType.key} lifecycle.`,
  path: ['status'],
  remediation: `Use one of: ${Object.keys(recordType.lifecycle.statuses).join(', ')}.`,
});

const resolutionRequiredFinding = (status: string): Finding => ({
  code: 'lifecycle.resolution.required',
  severity: 'error',
  message: `Terminal status "${status}" requires a resolution block.`,
  path: ['resolution'],
  remediation: 'Add resolved_at and rationale before moving this record to a terminal status.',
});

const activeResolutionForbiddenFinding = (status: string): Finding => ({
  code: 'lifecycle.resolution.active_forbidden',
  severity: 'error',
  message: `Active status "${status}" cannot carry a resolution block.`,
  path: ['resolution'],
  remediation:
    'Remove resolution metadata while the record is active, or move the record to a terminal lifecycle status.',
});

const dispositionMismatchFinding = (resolution: Resolution, status: string): Finding => ({
  code: 'lifecycle.resolution.disposition_mismatch',
  severity: 'error',
  message: `Resolution disposition "${resolution.disposition}" must match status "${status}".`,
  path: ['resolution', 'disposition'],
  remediation: 'Keep the status and resolution disposition aligned so exports and checks agree.',
});

const evidenceRefsRequiredFinding = (status: string): Finding => ({
  code: 'lifecycle.resolution.evidence_refs.required',
  severity: 'error',
  message: `Status "${status}" requires at least one resolution evidence reference.`,
  path: ['resolution', 'evidence_refs'],
  remediation: 'Add a concrete reference proving where the terminal disposition landed.',
});

const conversionTargetsRequiredFinding = (status: string): Finding => ({
  code: 'lifecycle.conversion_targets.required',
  severity: 'error',
  message: `Status "${status}" requires at least one conversion target.`,
  path: ['conversion_targets'],
  remediation: 'Add conversion_targets with kind, ref, and rationale for the durable destination.',
});

const transitionMissingFinding = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  fromStatus: string,
  toStatus: string,
): Finding => ({
  code: 'lifecycle.transition.unsupported',
  severity: 'error',
  message: `Transition "${fromStatus}" → "${toStatus}" is not part of the ${recordType.key} lifecycle.`,
  path: ['status'],
  remediation: 'Use a transition declared by the record type lifecycle.',
});

const transitionTargetStatusFinding = (actualStatus: string, toStatus: string): Finding => ({
  code: 'lifecycle.transition.target_status_mismatch',
  severity: 'error',
  message: `Record status "${actualStatus}" must match transition target "${toStatus}".`,
  path: ['status'],
  remediation: 'Apply the target status before validating transition evidence.',
});

const resolutionFindings = <Frontmatter extends BaseRecordFrontmatter>(
  evidence: LifecycleEvidenceRequirement,
  record: ParsedRecord<Frontmatter>,
  options: { readonly forbidResolutionWithoutRequirement?: boolean } = {},
): ReadonlyArray<Finding> => {
  const { resolution, status } = record.frontmatter;

  if (evidence.requiresResolution === true && !resolution) {
    return [resolutionRequiredFinding(status)];
  }

  if (
    options.forbidResolutionWithoutRequirement === true &&
    evidence.requiresResolution !== true &&
    resolution
  ) {
    return [activeResolutionForbiddenFinding(status)];
  }

  if (resolution && resolution.disposition !== status) {
    return [dispositionMismatchFinding(resolution, status)];
  }

  return [];
};

const resolutionEvidenceFindings = <Frontmatter extends BaseRecordFrontmatter>(
  evidence: LifecycleEvidenceRequirement,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  if (
    evidence.requiresResolutionEvidenceRefs === true &&
    !hasItems(record.frontmatter.resolution?.evidence_refs)
  ) {
    return [evidenceRefsRequiredFinding(record.frontmatter.status)];
  }

  return [];
};

const conversionTargetFindings = <Frontmatter extends BaseRecordFrontmatter>(
  evidence: LifecycleEvidenceRequirement,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  if (
    evidence.requiresConversionTargets === true &&
    !hasItems(record.frontmatter.conversion_targets)
  ) {
    return [conversionTargetsRequiredFinding(record.frontmatter.status)];
  }

  return [];
};

const collectEvidenceFindings = <Frontmatter extends BaseRecordFrontmatter>(
  evidence: LifecycleEvidenceRequirement,
  record: ParsedRecord<Frontmatter>,
  options: { readonly forbidResolutionWithoutRequirement?: boolean } = {},
): ReadonlyArray<Finding> => [
  ...resolutionFindings(evidence, record, options),
  ...resolutionEvidenceFindings(evidence, record),
  ...conversionTargetFindings(evidence, record),
];

const validateLifecycleEvidence = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  const { status } = record.frontmatter;
  const statusDefinition = recordType.lifecycle.statuses[status];

  if (!statusDefinition) {
    return [unknownStatusFinding(recordType, status)];
  }

  return collectEvidenceFindings(statusDefinition.evidence ?? {}, record, {
    forbidResolutionWithoutRequirement:
      statusDefinition.kind === 'active' && statusDefinition.allowsActiveResolution !== true,
  });
};

const findTransition = (
  lifecycle: LifecycleDefinition,
  fromStatus: string,
  toStatus: string,
): LifecycleTransitionDefinition | null =>
  lifecycle.transitions.find(
    (candidate) => candidate.from === fromStatus && candidate.to === toStatus,
  ) ?? null;

const validateTransitionEvidence = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  fromStatus: string,
  toStatus: string,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  const transition = findTransition(recordType.lifecycle, fromStatus, toStatus);

  if (!transition) {
    return [transitionMissingFinding(recordType, fromStatus, toStatus)];
  }

  return collectEvidenceFindings(transition.evidence ?? {}, record);
};

const transitionStatusFindings = <Frontmatter extends BaseRecordFrontmatter>(
  record: ParsedRecord<Frontmatter>,
  toStatus: string,
): ReadonlyArray<Finding> => {
  if (record.frontmatter.status !== toStatus) {
    return [transitionTargetStatusFinding(record.frontmatter.status, toStatus)];
  }

  return [];
};

const validateTransition = <Frontmatter extends BaseRecordFrontmatter>(
  recordType: RecordType<Frontmatter>,
  fromStatus: string,
  toStatus: string,
  record: ParsedRecord<Frontmatter>,
): ReadonlyArray<Finding> => {
  const transition = findTransition(recordType.lifecycle, fromStatus, toStatus);

  if (!transition) {
    return [transitionMissingFinding(recordType, fromStatus, toStatus)];
  }

  return [
    ...transitionStatusFindings(record, toStatus),
    ...collectEvidenceFindings(transition.evidence ?? {}, record),
    ...validateLifecycleEvidence(recordType, record),
  ];
};

const firstNonEmptyBodyLine = (body: string): string =>
  body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';

const projectBaseRecordForExport = <Frontmatter extends BaseRecordFrontmatter>(
  record: ParsedRecord<Frontmatter>,
): ExportDocument => ({
  schemaVersion: 1,
  id: record.frontmatter.id,
  recordType: record.frontmatter.record_type,
  status: record.frontmatter.status,
  title: record.frontmatter.title,
  visibility: record.frontmatter.visibility,
  tags: [...record.frontmatter.tags],
  frontmatter: record.frontmatter,
  body: record.body,
});

export {
  createRecordTypeRegistry,
  firstNonEmptyBodyLine,
  projectBaseRecordForExport,
  validateLifecycleEvidence,
  validateTransition,
  validateTransitionEvidence,
};
export type {
  BaseRecordFrontmatter,
  ConversionTarget,
  ConversionTargetKind,
  EvidenceRef,
  EvidenceRefKind,
  ExportDocument,
  Finding,
  FindingSeverity,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonSchemaDocument,
  JsonValue,
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
  ValidationVocabulary,
  ValidationVocabularyTerm,
  Visibility,
};
