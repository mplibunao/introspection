import type * as Option from 'effect/Option';
import { Command } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import type { RepoContext } from '../../config/repo-context.js';
import { buildOrientation } from '../../core/orientation.js';
import { orientationHuman } from '../../presenters/human.js';
import { orientationJson } from '../../presenters/json.js';
import { recordTypeRegistry } from '../../record-types/registry.js';
import type { MarkdownRecordReadResult } from '../../store/markdown-record-store.js';
import { loadAppServicesForRoot } from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

type Orientation = ReturnType<typeof buildOrientation>;
type OrientationPolicyDoc = Orientation['policyDocs'][number];
type OrientationRecordInput = Parameters<typeof buildOrientation>[0]['records'][number];

const primeUsage = 'Usage: introspection prime [--root PATH] [--json]';

/*
 * Orientation derives its counts from frontmatter (record_type/status) only;
 * prime never reads bodies or runs validation.
 */
const orientationRecords = (
  results: ReadonlyArray<MarkdownRecordReadResult>,
): ReadonlyArray<OrientationRecordInput> =>
  results
    .filter((result) => result.ok)
    .map((result) => ({
      recordType: result.record.frontmatter.record_type,
      status: result.record.frontmatter.status,
    }));

const failedReadCount = (results: ReadonlyArray<MarkdownRecordReadResult>): number =>
  results.filter((result) => !result.ok).length;

const orientationPolicyDocs = (repo: RepoContext): ReadonlyArray<OrientationPolicyDoc> =>
  repo.policyDocs.map((doc) => ({
    name: doc.name,
    relativePath: doc.relativePath,
    appliesTo: doc.applies_to ?? [],
  }));

const renderOrientation = (json: boolean, repo: RepoContext, orientation: Orientation): string => {
  if (json) {
    return orientationJson(repo, orientation);
  }

  return orientationHuman(repo, orientation);
};

const runPrime =
  (root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const services = await loadAppServicesForRoot(env, root);
    const results = await services.store.listRecordResults();
    const orientation = buildOrientation({
      records: orientationRecords(results),
      failedReadCount: failedReadCount(results),
      registry: recordTypeRegistry,
      vocabularyTerms: services.repo.vocabulary.terms,
      policyDocs: orientationPolicyDocs(services.repo),
      now: env.now(),
    });

    return { stdout: renderOrientation(env.json, services.repo, orientation) };
  };

const primeCommand = Command.make('prime', { root: rootFlagOption }).pipe(
  Command.withDescription('Show repo orientation: record counts, policy docs, vocabulary.'),
  Command.withHandler((config) => dispatch(runPrime(config.root))),
);

const primeSpec: FlagSpec = { strictFlags: true, maxPositionals: 0, usage: primeUsage };

export { primeCommand, primeSpec };
