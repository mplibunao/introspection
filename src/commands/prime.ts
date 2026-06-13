/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import type { RepoContext } from '../config/repo-context.js';
import { buildOrientation } from '../core/orientation.js';
import type {
  Orientation,
  OrientationPolicyDoc,
  OrientationRecordInput,
} from '../core/orientation.js';
import { orientationHuman } from '../presenters/human.js';
import { orientationJson } from '../presenters/json.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import type { MarkdownRecordReadResult } from '../store/markdown-record-store.js';

import {
  assertKnownFlags,
  assertNoExtraPositionals,
  contextWithRootOverride,
  failure,
  loadAppServices,
  parseFlags,
} from './helpers.js';
import type { CommandHandler } from './types.js';

const primeUsage = 'Usage: introspection prime [--root PATH] [--json]';

/*
 * Orientation derives its counts from frontmatter (record_type/status) only.
 * listRecordResults loads bodies, but prime never reads or summarizes them and
 * never runs validation — see the WI-R01 invariant test.
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

const primeCommand: CommandHandler = async ({ args, context }) => {
  try {
    const { flags, positionals } = parseFlags(args);
    assertNoExtraPositionals(positionals, primeUsage);
    assertKnownFlags(flags, {}, primeUsage);
    const services = await loadAppServices(contextWithRootOverride(context, flags));
    const results = await services.store.listRecordResults();
    const orientation = buildOrientation({
      records: orientationRecords(results),
      failedReadCount: failedReadCount(results),
      registry: recordTypeRegistry,
      vocabularyTerms: services.repo.vocabulary.terms,
      policyDocs: orientationPolicyDocs(services.repo),
      now: context.now(),
    });

    return { stdout: renderOrientation(context.json, services.repo, orientation) };
  } catch (error) {
    return failure(error);
  }
};

export { primeCommand };
