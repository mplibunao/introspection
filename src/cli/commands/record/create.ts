import * as Option from 'effect/Option';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../../commands/types.js';
import { buildRecordCandidate } from '../../../core/record-candidate.js';
import type { EvidenceRef, ParsedRecord, SourceBlock } from '../../../core/record-type-types.js';
import { isoTimestamp } from '../../../core/time.js';
import { recordHuman } from '../../../presenters/human.js';
import { recordJson } from '../../../presenters/json.js';
import { techDebtRecordType } from '../../../record-types/tech-debt.js';
import { allocateRecord } from '../../../store/id-allocator.js';
import {
  cliUsageError,
  loadAppServicesForRoot,
  parseEvidenceRefKind,
  requireFlagValue,
  toFailure,
  validationContextFor,
} from '../../app-services.js';
import type { CliEnvShape } from '../../env.js';
import { dispatch } from '../../output.js';

import { rootFlagOption } from '../shared.js';
import {
  assertCandidateRecordIsValid,
  recordCreateUsage,
  recordTransitionUsage,
} from './common.js';

type AppServices = Awaited<ReturnType<typeof loadAppServicesForRoot>>;

interface AllocatedRecordIdentity {
  readonly id: string;
  readonly number: number;
  readonly relativePath: string;
}

interface CreateConfig {
  readonly type: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly problem: Option.Option<string>;
  readonly whyDeferred: Option.Option<string>;
  readonly revisitTrigger: Option.Option<string>;
  readonly doneWhen: Option.Option<string>;
  readonly sourceRef: Option.Option<string>;
  readonly sourceKind: Option.Option<string>;
  readonly tag: ReadonlyArray<string>;
  readonly root: Option.Option<string>;
}

const techDebtBody = (config: CreateConfig): string => {
  const sections: Array<readonly [string, string]> = [
    ['## Problem', requireFlagValue(Option.getOrUndefined(config.problem), 'problem')],
    [
      '## Why deferred',
      requireFlagValue(Option.getOrUndefined(config.whyDeferred), 'why-deferred'),
    ],
    [
      '## Revisit trigger',
      requireFlagValue(Option.getOrUndefined(config.revisitTrigger), 'revisit-trigger'),
    ],
  ];
  const doneWhen = Option.getOrUndefined(config.doneWhen);

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

// --source-kind is only meaningful alongside --source-ref and is ignored when the ref is absent.
const optionalSourceRef = (config: CreateConfig): EvidenceRef | undefined => {
  const ref = Option.getOrUndefined(config.sourceRef);

  if (!ref) {
    return;
  }

  return {
    kind: parseEvidenceRefKind(Option.getOrUndefined(config.sourceKind) ?? 'other'),
    ref,
  };
};

const makeTechDebtRecord =
  (config: CreateConfig, repo: AppServices['repo'], now: string) =>
  (identity: AllocatedRecordIdentity): ParsedRecord => {
    const candidate = buildRecordCandidate({
      recordType: techDebtRecordType,
      repoKey: repo.repoKey,
      number: identity.number,
      status: 'open',
      title: requireFlagValue(Option.getOrUndefined(config.title), 'title'),
      visibility: repo.defaultVisibility,
      createdAt: now,
      body: techDebtBody(config),
      source: buildSource(now, optionalSourceRef(config)),
      userTags: config.tag,
      validationContext: validationContextFor(repo),
    });

    assertCandidateRecordIsValid(
      repo,
      candidate.record,
      'record.create.invalid',
      'Created record candidate failed validation before write.',
    );

    return candidate.record;
  };

const runCreate =
  (config: CreateConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    if (Option.getOrUndefined(config.type) !== 'tech-debt') {
      return toFailure(
        cliUsageError(
          `${recordCreateUsage}\n       ${recordTransitionUsage}`,
          'Unsupported record command.',
        ),
      );
    }

    const { repo } = await loadAppServicesForRoot(env, config.root);
    const result = await allocateRecord({
      context: repo,
      makeRecord: makeTechDebtRecord(config, repo, isoTimestamp(env.now())),
      recordType: techDebtRecordType,
    });

    if (env.json) {
      return { stdout: recordJson(result.record) };
    }

    return { stdout: recordHuman(result.record) };
  };

const createCommand = Command.make('create', {
  type: Argument.string('record-type').pipe(
    Argument.withDescription('Record type to create (currently only tech-debt).'),
    Argument.optional,
  ),
  title: Flag.string('title').pipe(Flag.withDescription('Record title.'), Flag.optional),
  problem: Flag.string('problem').pipe(
    Flag.withDescription('Problem section body.'),
    Flag.optional,
  ),
  whyDeferred: Flag.string('why-deferred').pipe(
    Flag.withDescription('Why deferred section body.'),
    Flag.optional,
  ),
  revisitTrigger: Flag.string('revisit-trigger').pipe(
    Flag.withDescription('Revisit trigger section body.'),
    Flag.optional,
  ),
  doneWhen: Flag.string('done-when').pipe(
    Flag.withDescription('Optional done-when section body.'),
    Flag.optional,
  ),
  sourceRef: Flag.string('source-ref').pipe(
    Flag.withDescription('Source evidence reference.'),
    Flag.optional,
  ),
  sourceKind: Flag.string('source-kind').pipe(
    Flag.withDescription('Source evidence kind.'),
    Flag.optional,
  ),
  tag: Flag.string('tag').pipe(Flag.withDescription('Extra record tag.'), Flag.atLeast(0)),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Create a tech-debt record.'),
  Command.withHandler((config) => dispatch(runCreate(config))),
);

export { createCommand };
