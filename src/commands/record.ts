/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { access } from 'node:fs/promises';

import type { RepoContext } from '../config/repo-context.js';
import { IntrospectionError } from '../core/errors.js';
import { validateTransition } from '../core/lifecycle.js';
import type {
  EvidenceRef,
  Finding,
  ParsedRecord,
  Resolution,
  SourceBlock,
} from '../core/record-type-types.js';
import { checkRecordResults } from '../core/validation.js';
import { recordHuman, transitionHuman } from '../presenters/human.js';
import { recordJson, transitionJson } from '../presenters/json.js';
import { techDebtRecordType } from '../record-types/tech-debt.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import type { TechDebtFrontmatter } from '../record-types/tech-debt-types.js';
import { allocateRecord } from '../store/id-allocator.js';
import type { AllocatedRecordIdentity } from '../store/id-allocator.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';

import {
  cliUsageError,
  evidenceRefFromFlags,
  failure,
  flagValues,
  isoTimestamp,
  loadAppServices,
  optionalFlag,
  parseEvidenceRefKind,
  parseFlags,
  recordTypeFor,
  requirePositional,
  requiredFlag,
  validationContextFor,
} from './helpers.js';
import type { CliCommandContext, CommandHandler, CommandOutcome } from './types.js';

const recordCreateUsage =
  'introspection record create tech-debt --title <title> --problem <text> --why-deferred <text> --revisit-trigger <text> [--source-ref <ref>] [--json]';
const recordTransitionUsage =
  'introspection record transition <record-path> <status> --rationale <text> [--evidence-ref <ref>] [--json]';
const transitionArgumentCount = 2;
const markdownExtension = '.md';

const unique = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

const renderCreatedRecord = (json: boolean, record: StoredMarkdownRecord): string => {
  if (json) {
    return recordJson(record);
  }

  return recordHuman(record);
};

const renderTransitionRecord = (json: boolean, record: StoredMarkdownRecord): string => {
  if (json) {
    return transitionJson(record);
  }

  return transitionHuman(record);
};

const techDebtBody = (flags: Map<string, ReadonlyArray<string>>): string => {
  const doneWhen = optionalFlag(flags, 'done-when');
  const sections = [
    ['## Problem', requiredFlag(flags, 'problem')],
    ['## Why deferred', requiredFlag(flags, 'why-deferred')],
    ['## Revisit trigger', requiredFlag(flags, 'revisit-trigger')],
  ];

  if (doneWhen) {
    sections.push(['## Done when', doneWhen]);
  }

  return `${sections.map(([heading, text]) => `${heading}\n\n${text}`).join('\n\n')}\n`;
};

const buildSource = (now: string, ref: EvidenceRef | undefined): SourceBlock => {
  if (ref) {
    return { discovered_at: now, refs: [ref] };
  }

  return { discovered_at: now };
};

// Returns undefined when --source-ref is not provided; --source-kind is only
// Meaningful alongside --source-ref and is ignored when the ref is absent.
const optionalSourceRef = (flags: Map<string, ReadonlyArray<string>>): EvidenceRef | undefined => {
  const ref = optionalFlag(flags, 'source-ref');

  if (!ref) {
    // eslint rule no-undefined bans the undefined identifier; implicit return
    return;
  }

  return {
    kind: parseEvidenceRefKind(optionalFlag(flags, 'source-kind') ?? 'other'),
    ref,
  };
};

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

const techDebtFrontmatter = (
  flags: Map<string, ReadonlyArray<string>>,
  context: RepoContext,
  identity: AllocatedRecordIdentity,
  now: string,
): TechDebtFrontmatter => ({
  schema_version: 1,
  id: identity.id,
  repo_key: context.repoKey,
  record_type: 'tech-debt',
  number: identity.number,
  title: requiredFlag(flags, 'title'),
  status: 'open',
  type: 'introspection-record',
  category: 'tech-debt',
  visibility: context.defaultVisibility,
  created_at: now,
  updated_at: now,
  tags: unique([
    'record/tech-debt',
    `repo/${context.repoSlug}`,
    'status/open',
    `visibility/${context.defaultVisibility}`,
    ...flagValues(flags, 'tag'),
  ]),
  source: buildSource(now, optionalSourceRef(flags)),
});

const makeTechDebtRecord =
  (
    flags: Map<string, ReadonlyArray<string>>,
    context: RepoContext,
    now: string,
  ): ((identity: AllocatedRecordIdentity) => ParsedRecord<TechDebtFrontmatter>) =>
  (identity) => {
    const record = {
      frontmatter: techDebtFrontmatter(flags, context, identity, now),
      body: techDebtBody(flags),
    };

    assertCandidateRecordIsValid(
      context,
      record,
      'record.create.invalid',
      'Created record candidate failed validation before write.',
    );

    return record;
  };

const createTechDebtRecord = async (
  args: ReadonlyArray<string>,
  requestContext: CliCommandContext,
): Promise<CommandOutcome> => {
  const { flags, positionals } = parseFlags(args);

  if (positionals.length > 0) {
    return failure(
      cliUsageError(recordCreateUsage, 'Command received unexpected arguments.', {
        arguments: positionals,
      }),
    );
  }

  const { repo } = await loadAppServices(requestContext);
  const result = await allocateRecord({
    context: repo,
    makeRecord: makeTechDebtRecord(flags, repo, isoTimestamp(requestContext.now())),
    recordType: techDebtRecordType,
  });

  return { stdout: renderCreatedRecord(requestContext.json, result.record) };
};

const resolutionFor = (
  status: string,
  flags: Map<string, ReadonlyArray<string>>,
  now: string,
): Resolution | undefined => {
  const rationale = optionalFlag(flags, 'rationale');

  if (!rationale) {
    return;
  }

  const evidenceRefs = evidenceRefFromFlags(flags);
  const resolution: Resolution = {
    disposition: status,
    resolved_at: optionalFlag(flags, 'resolved-at') ?? now,
    rationale,
  };

  if (evidenceRefs.length > 0) {
    return { ...resolution, evidence_refs: evidenceRefs };
  }

  return resolution;
};

const transitionFrontmatter = (
  record: ParsedRecord,
  status: string,
  flags: Map<string, ReadonlyArray<string>>,
  now: string,
): ParsedRecord['frontmatter'] => {
  const resolution = resolutionFor(status, flags, now);
  const frontmatter = {
    ...record.frontmatter,
    status,
    updated_at: now,
    tags: unique([
      ...record.frontmatter.tags.filter((tag) => !tag.startsWith('status/')),
      `status/${status}`,
    ]),
  };

  if (resolution) {
    return { ...frontmatter, resolution };
  }

  return frontmatter;
};

const recordWithTransition = (
  record: ParsedRecord,
  status: string,
  flags: Map<string, ReadonlyArray<string>>,
  now: string,
): ParsedRecord => ({
  ...record,
  frontmatter: transitionFrontmatter(record, status, flags, now),
  body: record.body,
});

const transitionFailure = (
  record: StoredMarkdownRecord,
  status: string,
  findings: ReadonlyArray<Finding>,
): CommandOutcome =>
  failure(
    new IntrospectionError(
      'record.transition.invalid',
      `Transition from ${record.frontmatter.status} to ${status} failed validation.`,
      { findings },
    ),
  );

const transitionTargetPath = (record: ParsedRecord): string =>
  `${record.frontmatter.record_type}/${record.frontmatter.status}/${record.frontmatter.id.toLowerCase()}${markdownExtension}`;

const pathExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const assertTransitionTargetAvailable = async (
  store: Awaited<ReturnType<typeof loadAppServices>>['store'],
  record: StoredMarkdownRecord,
  targetPath: string,
): Promise<void> => {
  if (record.relativePath === targetPath) {
    return;
  }

  if (await pathExists(`${store.root}/${targetPath}`)) {
    throw new IntrospectionError(
      'record.transition.target_exists',
      'Transition target path already exists, so the source record was left unchanged.',
      { sourcePath: record.relativePath, targetPath },
    );
  }
};

const updateAndMoveTransitionedRecord = async (
  store: Awaited<ReturnType<typeof loadAppServices>>['store'],
  record: StoredMarkdownRecord,
  transitioned: ParsedRecord,
): Promise<StoredMarkdownRecord> => {
  const targetPath = transitionTargetPath(transitioned);
  await assertTransitionTargetAvailable(store, record, targetPath);
  const updated = await store.updateRecord(record, transitioned);

  if (updated.relativePath === targetPath) {
    return updated;
  }

  return store.moveRecord(updated, targetPath);
};

const transitionRecordAtPath = async (
  recordPath: string,
  status: string,
  flags: Map<string, ReadonlyArray<string>>,
  requestContext: CliCommandContext,
): Promise<CommandOutcome> => {
  const { repo, store } = await loadAppServices(requestContext);
  const record = await store.readRecord(recordPath);
  const recordType = recordTypeFor(record);
  const transitioned = recordWithTransition(
    record,
    status,
    flags,
    isoTimestamp(requestContext.now()),
  );
  const findings = [
    ...validateTransition(recordType, record.frontmatter.status, status, transitioned),
    ...candidateFindings(repo, transitioned),
  ];

  if (findings.some((finding) => finding.severity === 'error')) {
    return transitionFailure(record, status, findings);
  }

  const finalRecord = await updateAndMoveTransitionedRecord(store, record, transitioned);

  return { stdout: renderTransitionRecord(requestContext.json, finalRecord) };
};

const transitionRecord = async (
  args: ReadonlyArray<string>,
  requestContext: CliCommandContext,
): Promise<CommandOutcome> => {
  const { flags, positionals } = parseFlags(args);
  const recordPath = requirePositional(positionals, 0, 'record-path', recordTransitionUsage);
  const status = requirePositional(positionals, 1, 'status', recordTransitionUsage);

  if (positionals.length > transitionArgumentCount) {
    return failure(
      cliUsageError(recordTransitionUsage, 'Command received unexpected arguments.', {
        arguments: positionals.slice(transitionArgumentCount),
      }),
    );
  }

  return transitionRecordAtPath(recordPath, status, flags, requestContext);
};

const recordCommand: CommandHandler = async ({ args, context }) => {
  try {
    const [subcommand, recordType, ...rest] = args;

    if (subcommand === 'create' && recordType === 'tech-debt') {
      return createTechDebtRecord(rest, context);
    }

    if (subcommand === 'transition') {
      return transitionRecord(args.slice(1), context);
    }

    return failure(
      cliUsageError(
        `${recordCreateUsage}\n       ${recordTransitionUsage}`,
        'Unsupported record command.',
      ),
      1,
    );
  } catch (error) {
    return failure(error);
  }
};

export { recordCommand };
