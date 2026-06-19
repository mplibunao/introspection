import * as Option from 'effect/Option';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import type { VocabularyProvenance, VocabularyTerm } from '../../config/repo-context.js';
import type { CommandOutcome } from '../../commands/types.js';
import {
  approveVocabularyTerm,
  deleteVocabularyTermIfUnused,
  listVocabularyTerms,
  mergeVocabularyTags,
  proposeVocabularyTerm,
  rejectVocabularyTerm,
  renameVocabularyTag,
  vocabularyUsage,
} from '../../core/vocabulary.js';
import {
  vocabularyCascadeHuman,
  vocabularyDeleteHuman,
  vocabularyMutationHuman,
  vocabularyTermsHuman,
  vocabularyUsageHuman,
} from '../../presenters/human.js';
import {
  vocabularyCascadeJson,
  vocabularyDeleteJson,
  vocabularyJson,
  vocabularyTermsJson,
  vocabularyUsageJson,
} from '../../presenters/json.js';
import {
  cliUsageError,
  loadAppServicesForRoot,
  parseProvenanceKind,
  requireFlagValue,
  toFailure,
} from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

const vocabUsage = [
  'introspection vocab list [--status <approved|provisional|rejected>] [--root PATH] [--json]',
  'introspection vocab usage [tag ...] [--root PATH] [--json]',
  'introspection vocab propose <tag> --description <text> [--provenance-ref <ref>] [--root PATH] [--json]',
  'introspection vocab approve <tag> [--root PATH] [--json]',
  'introspection vocab reject <tag> [--root PATH] [--json]',
  'introspection vocab rename <from-tag> <to-tag> [--root PATH] [--json]',
  'introspection vocab merge <from-tag> <to-tag> [--root PATH] [--json]',
  'introspection vocab delete <tag> [--root PATH] [--json]',
].join('\n       ');

type VocabularyStatus = VocabularyTerm['status'];

const listOptions = (status: VocabularyStatus | undefined): { status?: VocabularyStatus } => {
  if (status) {
    return { status };
  }

  return {};
};

const runList =
  (status: Option.Option<VocabularyStatus>, root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo } = await loadAppServicesForRoot(env, root);
    const terms = listVocabularyTerms(repo.vocabulary, listOptions(Option.getOrUndefined(status)));

    if (env.json) {
      return { stdout: vocabularyTermsJson(terms) };
    }

    return { stdout: vocabularyTermsHuman(terms) };
  };

const usageForTags = async (
  repo: Parameters<typeof vocabularyUsage>[0],
  store: Parameters<typeof vocabularyUsage>[1],
  tags: ReadonlyArray<string>,
): ReturnType<typeof vocabularyUsage> => {
  if (tags.length === 0) {
    return vocabularyUsage(repo, store);
  }

  return vocabularyUsage(repo, store, tags);
};

const runUsage =
  (tags: ReadonlyArray<string>, root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, root);
    const usage = await usageForTags(repo, store, tags);

    if (env.json) {
      return { stdout: vocabularyUsageJson(usage) };
    }

    return { stdout: vocabularyUsageHuman(usage) };
  };

interface ProposeConfig {
  readonly tag: string;
  readonly description: Option.Option<string>;
  readonly alias: ReadonlyArray<string>;
  readonly appliesTo: ReadonlyArray<string>;
  readonly provenanceKind: Option.Option<string>;
  readonly provenanceRef: Option.Option<string>;
  readonly provenanceNotedAt: Option.Option<string>;
  readonly root: Option.Option<string>;
}

const provenanceFrom = (config: ProposeConfig): VocabularyProvenance => {
  const kind = parseProvenanceKind(Option.getOrUndefined(config.provenanceKind) ?? 'human');
  const ref = Option.getOrUndefined(config.provenanceRef);
  const notedAt = Option.getOrUndefined(config.provenanceNotedAt);

  // Build provenance with only the fields explicitly supplied; ref is optional
  // When the term has no traceable source to cite.
  return {
    kind,
    ...(ref && { ref }),
    ...(notedAt && { noted_at: notedAt }),
  };
};

const runPropose =
  (config: ProposeConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo } = await loadAppServicesForRoot(env, config.root);
    const vocabulary = await proposeVocabularyTerm({
      context: repo,
      term: {
        tag: config.tag,
        description: requireFlagValue(Option.getOrUndefined(config.description), 'description'),
        aliases: config.alias,
        applies_to: config.appliesTo,
        provenance: provenanceFrom(config),
      },
    });

    if (env.json) {
      return { stdout: vocabularyJson(vocabulary) };
    }

    return { stdout: vocabularyMutationHuman('Proposed', config.tag) };
  };

const applyStatusMutation = async (
  repo: Parameters<typeof approveVocabularyTerm>[0]['context'],
  tag: string,
  action: 'approve' | 'reject',
): ReturnType<typeof approveVocabularyTerm> => {
  if (action === 'approve') {
    return approveVocabularyTerm({ context: repo, tag });
  }

  return rejectVocabularyTerm({ context: repo, tag });
};

const statusMutationLabel = (action: 'approve' | 'reject'): string => {
  if (action === 'approve') {
    return 'Approved';
  }

  return 'Rejected';
};

const runStatusMutation =
  (tag: string, action: 'approve' | 'reject', root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo } = await loadAppServicesForRoot(env, root);
    const vocabulary = await applyStatusMutation(repo, tag, action);

    if (env.json) {
      return { stdout: vocabularyJson(vocabulary) };
    }

    return { stdout: vocabularyMutationHuman(statusMutationLabel(action), tag) };
  };

interface CascadeInputs {
  readonly repo: Parameters<typeof renameVocabularyTag>[0]['context'];
  readonly store: Parameters<typeof renameVocabularyTag>[0]['store'];
  readonly fromTag: string;
  readonly toTag: string;
  readonly action: 'merge' | 'rename';
}

const applyCascade = async (inputs: CascadeInputs): ReturnType<typeof renameVocabularyTag> => {
  const { repo, store, fromTag, toTag, action } = inputs;

  if (action === 'rename') {
    return renameVocabularyTag({ context: repo, fromTag, store, toTag });
  }

  return mergeVocabularyTags({ context: repo, fromTag, store, toTag });
};

const cascadeLabel = (action: 'merge' | 'rename'): string => {
  if (action === 'rename') {
    return 'Renamed';
  }

  return 'Merged';
};

const runCascade =
  (fromTag: string, toTag: string, action: 'merge' | 'rename', root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, root);
    const result = await applyCascade({ repo, store, fromTag, toTag, action });

    if (env.json) {
      return { stdout: vocabularyCascadeJson(result) };
    }

    return { stdout: vocabularyCascadeHuman(result, cascadeLabel(action)) };
  };

const runDelete =
  (tag: string, root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, root);
    const result = await deleteVocabularyTermIfUnused({ context: repo, store, tag });

    if (env.json) {
      return { stdout: vocabularyDeleteJson(result) };
    }

    return { stdout: vocabularyDeleteHuman(result) };
  };

const tagArgument = (description: string): Argument.Argument<string> =>
  Argument.string('tag').pipe(Argument.withDescription(description));

const listCommand = Command.make('list', {
  status: Flag.choice('status', ['approved', 'provisional', 'rejected']).pipe(
    Flag.withDescription('Filter by term status.'),
    Flag.optional,
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('List vocabulary terms.'),
  Command.withHandler((config) => dispatch(runList(config.status, config.root))),
);

const usageCommand = Command.make('usage', {
  tags: Argument.string('tag').pipe(
    Argument.withDescription('Tags to report usage for (all when omitted).'),
    Argument.variadic(),
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Report record usage for vocabulary terms.'),
  Command.withHandler((config) => dispatch(runUsage(config.tags, config.root))),
);

const proposeCommand = Command.make('propose', {
  tag: tagArgument('Tag to propose.'),
  description: Flag.string('description').pipe(
    Flag.withDescription('Term description.'),
    Flag.optional,
  ),
  alias: Flag.string('alias').pipe(Flag.withDescription('Term alias.'), Flag.atLeast(0)),
  appliesTo: Flag.string('applies-to').pipe(
    Flag.withDescription('Record type the term applies to.'),
    Flag.atLeast(0),
  ),
  provenanceKind: Flag.string('provenance-kind').pipe(
    Flag.withDescription('Provenance kind.'),
    Flag.optional,
  ),
  provenanceRef: Flag.string('provenance-ref').pipe(
    Flag.withDescription('Provenance reference.'),
    Flag.optional,
  ),
  provenanceNotedAt: Flag.string('provenance-noted-at').pipe(
    Flag.withDescription('Provenance noted-at timestamp.'),
    Flag.optional,
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Propose a new vocabulary term.'),
  Command.withHandler((config) => dispatch(runPropose(config))),
);

const approveCommand = Command.make('approve', {
  tag: tagArgument('Tag to approve.'),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Approve a vocabulary term.'),
  Command.withHandler((config) => dispatch(runStatusMutation(config.tag, 'approve', config.root))),
);

const rejectCommand = Command.make('reject', {
  tag: tagArgument('Tag to reject.'),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Reject a vocabulary term.'),
  Command.withHandler((config) => dispatch(runStatusMutation(config.tag, 'reject', config.root))),
);

const renameCommand = Command.make('rename', {
  fromTag: Argument.string('from-tag').pipe(Argument.withDescription('Existing tag.')),
  toTag: Argument.string('to-tag').pipe(Argument.withDescription('New tag.')),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Rename a vocabulary tag across records.'),
  Command.withHandler((config) =>
    dispatch(runCascade(config.fromTag, config.toTag, 'rename', config.root)),
  ),
);

const mergeCommand = Command.make('merge', {
  fromTag: Argument.string('from-tag').pipe(Argument.withDescription('Tag to merge from.')),
  toTag: Argument.string('to-tag').pipe(Argument.withDescription('Tag to merge into.')),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Merge one vocabulary tag into another.'),
  Command.withHandler((config) =>
    dispatch(runCascade(config.fromTag, config.toTag, 'merge', config.root)),
  ),
);

const deleteCommand = Command.make('delete', {
  tag: tagArgument('Tag to delete.'),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Delete an unused vocabulary term.'),
  Command.withHandler((config) => dispatch(runDelete(config.tag, config.root))),
);

const vocabCommand = Command.make('vocab').pipe(
  Command.withDescription('Manage record-local vocabulary.'),
  Command.withHandler(() =>
    dispatch(async () => toFailure(cliUsageError(vocabUsage, 'Specify a vocab subcommand.'))),
  ),
  Command.withSubcommands([
    listCommand,
    usageCommand,
    proposeCommand,
    approveCommand,
    rejectCommand,
    renameCommand,
    mergeCommand,
    deleteCommand,
  ]),
);

const leaf = (maxPositionals: number): FlagSpec => ({
  strictFlags: false,
  maxPositionals,
  usage: vocabUsage,
});

// Rename/merge take two tag positionals; the others take zero or one.
const cascadePositionals = 2;

const vocabSpecs = {
  list: leaf(0),
  usage: leaf(Number.POSITIVE_INFINITY),
  propose: leaf(1),
  approve: leaf(1),
  reject: leaf(1),
  rename: leaf(cascadePositionals),
  merge: leaf(cascadePositionals),
  delete: leaf(1),
} satisfies Record<string, FlagSpec>;

export { vocabCommand, vocabSpecs };
