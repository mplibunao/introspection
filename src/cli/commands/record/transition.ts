import * as Option from 'effect/Option';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../../commands/types.js';
import { IntrospectionError } from '../../../core/errors.js';
import { validateTransition } from '../../../core/lifecycle.js';
import type { EvidenceRef, ParsedRecord, Resolution } from '../../../core/record-type-types.js';
import { isoTimestamp } from '../../../core/time.js';
import { transitionHuman } from '../../../presenters/human.js';
import { transitionJson } from '../../../presenters/json.js';
import {
  loadAppServicesForRoot,
  parseEvidenceRefKind,
  recordTypeFor,
  toFailure,
} from '../../app-services.js';
import type { CliEnvShape } from '../../env.js';
import { dispatch } from '../../output.js';

import { rootFlagOption } from '../shared.js';
import { candidateFindings, updateAndMoveTransitionedRecord } from './common.js';

const unique = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

interface TransitionConfig {
  readonly recordPath: string;
  readonly status: string;
  readonly rationale: Option.Option<string>;
  readonly resolvedAt: Option.Option<string>;
  readonly evidenceKind: ReadonlyArray<string>;
  readonly evidenceRef: ReadonlyArray<string>;
  readonly root: Option.Option<string>;
}

const evidenceRefsFor = (config: TransitionConfig): ReadonlyArray<EvidenceRef> =>
  config.evidenceRef.map((ref, index) => ({
    kind: parseEvidenceRefKind(config.evidenceKind[index] ?? config.evidenceKind[0] ?? 'doc'),
    ref,
  }));

const resolutionFor = (config: TransitionConfig, now: string): Resolution | undefined => {
  const rationale = Option.getOrUndefined(config.rationale);

  if (!rationale) {
    return;
  }

  const evidenceRefs = evidenceRefsFor(config);
  const resolution: Resolution = {
    disposition: config.status,
    resolved_at: Option.getOrUndefined(config.resolvedAt) ?? now,
    rationale,
  };

  if (evidenceRefs.length > 0) {
    return { ...resolution, evidence_refs: evidenceRefs };
  }

  return resolution;
};

const transitionFrontmatter = (
  record: ParsedRecord,
  config: TransitionConfig,
  now: string,
): ParsedRecord['frontmatter'] => {
  const resolution = resolutionFor(config, now);
  const frontmatter = {
    ...record.frontmatter,
    status: config.status,
    updated_at: now,
    tags: unique([
      ...record.frontmatter.tags.filter((tag) => !tag.startsWith('status/')),
      `status/${config.status}`,
    ]),
  };

  if (resolution) {
    return { ...frontmatter, resolution };
  }

  return frontmatter;
};

const recordWithTransition = (
  record: ParsedRecord,
  config: TransitionConfig,
  now: string,
): ParsedRecord => ({
  ...record,
  frontmatter: transitionFrontmatter(record, config, now),
  body: record.body,
});

const transitionStdout = (json: boolean, record: Parameters<typeof transitionJson>[0]): string => {
  if (json) {
    return transitionJson(record);
  }

  return transitionHuman(record);
};

const runTransition =
  (config: TransitionConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, config.root);
    const record = await store.readRecord(config.recordPath);
    const recordType = recordTypeFor(record);
    const transitioned = recordWithTransition(record, config, isoTimestamp(env.now()));
    const findings = [
      ...validateTransition(recordType, record.frontmatter.status, config.status, transitioned),
      ...candidateFindings(repo, transitioned),
    ];

    if (findings.some((finding) => finding.severity === 'error')) {
      return toFailure(
        new IntrospectionError(
          'record.transition.invalid',
          `Transition from ${record.frontmatter.status} to ${config.status} failed validation.`,
          { findings },
        ),
      );
    }

    const finalRecord = await updateAndMoveTransitionedRecord(store, record, transitioned);

    return { stdout: transitionStdout(env.json, finalRecord) };
  };

const transitionCommand = Command.make('transition', {
  recordPath: Argument.string('record-path').pipe(
    Argument.withDescription('Path of the record to transition.'),
  ),
  status: Argument.string('status').pipe(Argument.withDescription('Target lifecycle status.')),
  rationale: Flag.string('rationale').pipe(
    Flag.withDescription('Resolution rationale.'),
    Flag.optional,
  ),
  resolvedAt: Flag.string('resolved-at').pipe(
    Flag.withDescription('Resolution timestamp override.'),
    Flag.optional,
  ),
  evidenceKind: Flag.string('evidence-kind').pipe(
    Flag.withDescription('Resolution evidence kind.'),
    Flag.atLeast(0),
  ),
  evidenceRef: Flag.string('evidence-ref').pipe(
    Flag.withDescription('Resolution evidence reference.'),
    Flag.atLeast(0),
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Move a record through its lifecycle.'),
  Command.withHandler((config) => dispatch(runTransition(config))),
);

export { transitionCommand };
