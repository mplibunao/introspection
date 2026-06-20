import type { RepoContext } from '../../../config/repo-context.js';
import { IntrospectionError } from '../../../core/errors.js';
import { canonicalRecordRelativePath } from '../../../core/id.js';
import type { Finding, ParsedRecord } from '../../../core/record-type-types.js';
import { checkRecordResults } from '../../../core/validation.js';
import { recordTypeRegistry } from '../../../record-types/registry.js';
import type {
  MarkdownRecordStore,
  StoredMarkdownRecord,
} from '../../../store/markdown-record-store.js';
import { validationContextFor } from '../../app-services.js';

/*
 * Validation and store helpers shared by record create and transition. Kept in
 * one module so each command file stays within the dependency ceiling and the
 * create/transition handlers agree on candidate validation and path moves.
 */

const recordCreateUsage =
  'introspection record create tech-debt --title <title> --problem <text> --why-deferred <text> --revisit-trigger <text> [--source-ref <ref>] [--root PATH] [--json]';
const recordTransitionUsage =
  'introspection record transition <record-path> <status> --rationale <text> [--evidence-ref <ref>] [--root PATH] [--json]';

const candidateFindings = (repo: RepoContext, record: ParsedRecord): ReadonlyArray<Finding> =>
  checkRecordResults([{ ok: true, record }], recordTypeRegistry, validationContextFor(repo))
    .findings;

const assertCandidateRecordIsValid = (
  repo: RepoContext,
  record: ParsedRecord,
  code: string,
  message: string,
): void => {
  const findings = candidateFindings(repo, record);

  if (findings.some((finding) => finding.severity === 'error')) {
    throw new IntrospectionError(code, message, { findings });
  }
};

const assertTransitionTargetAvailable = async (
  store: MarkdownRecordStore,
  record: StoredMarkdownRecord,
  targetPath: string,
): Promise<void> => {
  if (record.relativePath === targetPath) {
    return;
  }

  if (await store.pathExists(targetPath)) {
    throw new IntrospectionError(
      'record.transition.target_exists',
      'Transition target path already exists, so the source record was left unchanged.',
      { sourcePath: record.relativePath, targetPath },
    );
  }
};

const updateAndMoveTransitionedRecord = async (
  store: MarkdownRecordStore,
  record: StoredMarkdownRecord,
  transitioned: ParsedRecord,
): Promise<StoredMarkdownRecord> => {
  // CanonicalRecordRelativePath is the single source of truth for path construction.
  const targetPath = canonicalRecordRelativePath({
    id: transitioned.frontmatter.id,
    recordTypeKey: transitioned.frontmatter.record_type,
    status: transitioned.frontmatter.status,
  });
  await assertTransitionTargetAvailable(store, record, targetPath);
  const updated = await store.updateRecord(record, transitioned);

  if (updated.relativePath === targetPath) {
    return updated;
  }

  return store.moveRecord(updated, targetPath);
};

export {
  assertCandidateRecordIsValid,
  assertTransitionTargetAvailable,
  candidateFindings,
  recordCreateUsage,
  recordTransitionUsage,
  updateAndMoveTransitionedRecord,
};
