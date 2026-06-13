import type { VocabularyTerm } from '../config/repo-context.js';
import {
  approveVocabularyTerm,
  deleteVocabularyTermIfUnused,
  listVocabularyTerms,
  mergeVocabularyTags,
  proposeVocabularyTerm,
  rejectVocabularyTerm,
  renameVocabularyTag,
  vocabularyUsage,
} from '../core/vocabulary.js';
import {
  vocabularyCascadeHuman,
  vocabularyDeleteHuman,
  vocabularyMutationHuman,
  vocabularyTermsHuman,
  vocabularyUsageHuman,
} from '../presenters/human.js';
import {
  vocabularyCascadeJson,
  vocabularyDeleteJson,
  vocabularyJson,
  vocabularyTermsJson,
  vocabularyUsageJson,
} from '../presenters/json.js';

import {
  assertNoExtraPositionals,
  cliArgumentError,
  cliUsageError,
  failure,
  flagValues,
  loadAppServices,
  optionalFlag,
  parseFlags,
  provenanceFromFlags,
  requirePositional,
  requiredFlag,
} from './helpers.js';
import type { CommandHandler, CommandOutcome, CommandRequest } from './types.js';

const vocabUsage = [
  'introspection vocab list [--status <approved|provisional|rejected>] [--json]',
  'introspection vocab usage [tag ...] [--json]',
  'introspection vocab propose <tag> --description <text> [--provenance-ref <ref>] [--json]',
  'introspection vocab approve <tag> [--json]',
  'introspection vocab reject <tag> [--json]',
  'introspection vocab rename <from-tag> <to-tag> [--json]',
  'introspection vocab merge <from-tag> <to-tag> [--json]',
  'introspection vocab delete <tag> [--json]',
].join('\n       ');
const cascadeArgumentCount = 2;

const parseVocabularyStatus = (value: string | undefined): VocabularyTerm['status'] | undefined => {
  if (!value) {
    return;
  }

  switch (value) {
    case 'approved':
    case 'provisional':
    case 'rejected':
      return value;
    default:
      throw cliArgumentError('Vocabulary status is not supported.', {
        allowed: ['approved', 'provisional', 'rejected'],
        value,
      });
  }
};

const listOptions = (
  status: VocabularyTerm['status'] | undefined,
): Parameters<typeof listVocabularyTerms>[1] => {
  if (status) {
    return { status };
  }

  return {};
};

const renderTerms = (json: boolean, terms: ReadonlyArray<VocabularyTerm>): string => {
  if (json) {
    return vocabularyTermsJson(terms);
  }

  return vocabularyTermsHuman(terms);
};

const listCommand = async ({ args, context }: CommandRequest): Promise<CommandOutcome> => {
  const { flags, positionals } = parseFlags(args);
  assertNoExtraPositionals(positionals, vocabUsage);
  const { repo } = await loadAppServices(context);
  const status = parseVocabularyStatus(optionalFlag(flags, 'status'));
  const terms = listVocabularyTerms(repo.vocabulary, listOptions(status));

  return { stdout: renderTerms(context.json, terms) };
};

const vocabularyUsageForPositionals = async (
  repo: Awaited<ReturnType<typeof loadAppServices>>['repo'],
  store: Awaited<ReturnType<typeof loadAppServices>>['store'],
  positionals: ReadonlyArray<string>,
): ReturnType<typeof vocabularyUsage> => {
  if (positionals.length === 0) {
    return vocabularyUsage(repo, store);
  }

  return vocabularyUsage(repo, store, positionals);
};

const usageCommand = async ({ args, context }: CommandRequest): Promise<CommandOutcome> => {
  const { positionals } = parseFlags(args);
  const { repo, store } = await loadAppServices(context);
  const usage = await vocabularyUsageForPositionals(repo, store, positionals);

  if (context.json) {
    return { stdout: vocabularyUsageJson(usage) };
  }

  return { stdout: vocabularyUsageHuman(usage) };
};

const proposeCommand = async ({ args, context }: CommandRequest): Promise<CommandOutcome> => {
  const { flags, positionals } = parseFlags(args);
  const tag = requirePositional(positionals, 0, 'tag', vocabUsage);

  if (positionals.length > 1) {
    return failure(
      cliUsageError(vocabUsage, 'Command received unexpected arguments.', {
        arguments: positionals.slice(1),
      }),
    );
  }

  const { repo } = await loadAppServices(context);
  const vocabulary = await proposeVocabularyTerm({
    context: repo,
    term: {
      tag,
      description: requiredFlag(flags, 'description'),
      aliases: flagValues(flags, 'alias'),
      applies_to: flagValues(flags, 'applies-to'),
      provenance: provenanceFromFlags(flags),
    },
  });

  if (context.json) {
    return { stdout: vocabularyJson(vocabulary) };
  }

  return { stdout: vocabularyMutationHuman('Proposed', tag) };
};

const mutateVocabularyStatus = async (
  request: CommandRequest,
  tag: string,
  action: 'approve' | 'reject',
): Promise<Awaited<ReturnType<typeof approveVocabularyTerm>>> => {
  const { repo } = await loadAppServices(request.context);

  if (action === 'approve') {
    return approveVocabularyTerm({ context: repo, tag });
  }

  return rejectVocabularyTerm({ context: repo, tag });
};

const statusActionName = (action: 'approve' | 'reject'): string => {
  if (action === 'approve') {
    return 'Approved';
  }

  return 'Rejected';
};

const statusMutationCommand = async (
  request: CommandRequest,
  action: 'approve' | 'reject',
): Promise<CommandOutcome> => {
  const tag = requirePositional(request.args, 0, 'tag', vocabUsage);

  if (request.args.length > 1) {
    return failure(
      cliUsageError(vocabUsage, 'Command received unexpected arguments.', {
        arguments: request.args.slice(1),
      }),
    );
  }

  const vocabulary = await mutateVocabularyStatus(request, tag, action);

  if (request.context.json) {
    return { stdout: vocabularyJson(vocabulary) };
  }

  return { stdout: vocabularyMutationHuman(statusActionName(action), tag) };
};

const runCascade = async (
  request: CommandRequest,
  fromTag: string,
  toTag: string,
  action: 'merge' | 'rename',
): Promise<Awaited<ReturnType<typeof renameVocabularyTag>>> => {
  const { repo, store } = await loadAppServices(request.context);

  if (action === 'rename') {
    return renameVocabularyTag({ context: repo, fromTag, store, toTag });
  }

  return mergeVocabularyTags({ context: repo, fromTag, store, toTag });
};

const cascadeActionName = (action: 'merge' | 'rename'): string => {
  if (action === 'rename') {
    return 'Renamed';
  }

  return 'Merged';
};

const cascadeCommand = async (
  request: CommandRequest,
  action: 'merge' | 'rename',
): Promise<CommandOutcome> => {
  const fromTag = requirePositional(request.args, 0, 'from-tag', vocabUsage);
  const toTag = requirePositional(request.args, 1, 'to-tag', vocabUsage);

  if (request.args.length > cascadeArgumentCount) {
    return failure(
      cliUsageError(vocabUsage, 'Command received unexpected arguments.', {
        arguments: request.args.slice(cascadeArgumentCount),
      }),
    );
  }

  const result = await runCascade(request, fromTag, toTag, action);

  if (request.context.json) {
    return { stdout: vocabularyCascadeJson(result) };
  }

  return { stdout: vocabularyCascadeHuman(result, cascadeActionName(action)) };
};

const deleteCommand = async ({ args, context }: CommandRequest): Promise<CommandOutcome> => {
  const tag = requirePositional(args, 0, 'tag', vocabUsage);

  if (args.length > 1) {
    return failure(
      cliUsageError(vocabUsage, 'Command received unexpected arguments.', {
        arguments: args.slice(1),
      }),
    );
  }

  const { repo, store } = await loadAppServices(context);
  const result = await deleteVocabularyTermIfUnused({ context: repo, store, tag });

  if (context.json) {
    return { stdout: vocabularyDeleteJson(result) };
  }

  return { stdout: vocabularyDeleteHuman(result) };
};

const vocabCommand: CommandHandler = async ({ args, context }) => {
  try {
    const [subcommand, ...rest] = args;
    const request = { args: rest, context };

    switch (subcommand) {
      case 'list':
        return listCommand(request);
      case 'usage':
        return usageCommand(request);
      case 'propose':
        return proposeCommand(request);
      case 'approve':
        return statusMutationCommand(request, 'approve');
      case 'reject':
        return statusMutationCommand(request, 'reject');
      case 'rename':
        return cascadeCommand(request, 'rename');
      case 'merge':
        return cascadeCommand(request, 'merge');
      case 'delete':
        return deleteCommand(request);
      default:
        return failure(cliUsageError(vocabUsage, 'Unsupported vocabulary command.'));
    }
  } catch (error) {
    return failure(error);
  }
};

export { vocabCommand };
