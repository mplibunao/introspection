import * as CliError from 'effect/unstable/cli/CliError';

import type { ErrorDetails } from '../core/errors.js';

import type { CliErrorPayload } from '../commands/types.js';
import { cliArgumentError, cliUsageError } from './app-services.js';

/*
 * Strict flag pre-scan for the Effect CLI shell (IX-SR-02).
 *
 * Effect's parser is intentionally lenient: it ignores a value handed to a
 * boolean flag (`--all true`), treats a value-required flag with no value as
 * absent (`--limit` with nothing after it), and drops excess positionals. The
 * pre-cutover CLI rejected all three, and that strictness is forward-looking
 * input validation MP wants to keep (a swallowed flag value is a footgun), not
 * a backwards-compat shim. So before Effect parses, this single boundary guard
 * re-scans the command's own argv against its declared flag spec and raises the
 * same stable `cli.argument.invalid` / `cli.usage` errors the old parser did.
 *
 * Anything Effect *does* reject (unknown flags on a non-strict command, schema
 * decode failures, unknown subcommands) surfaces as a typed `CliError`, which
 * `mapCliError` folds back into the same stable error payload taxonomy.
 *
 * This is the lexer that used to drive command dispatch in
 * `src/commands/helpers.ts`; it is now demoted to a validation gate while Effect
 * owns parsing, schema validation, and dispatch.
 */

interface FlagSpec {
  /** Value-required flags accepted by the command. */
  readonly valued?: ReadonlyArray<string>;
  /** Boolean flags accepted by the command. */
  readonly boolean?: ReadonlyArray<string>;
  /** When true, reject unknown flags and malformed flag values (assertKnownFlags). */
  readonly strictFlags: boolean;
  /** Maximum positional arguments the command accepts (Infinity for variadic). */
  readonly maxPositionals: number;
  /** Usage string surfaced with usage errors. */
  readonly usage: string;
}

interface FlagParseResult {
  readonly flags: Map<string, ReadonlyArray<string>>;
  readonly positionals: ReadonlyArray<string>;
}

const flagPrefix = '--';
const flagPrefixLength = 2;
/*
 * Sentinel stored when a flag appears without consuming a following token. A NUL
 * byte cannot occur in a process argument, so a bare `--flag` is always
 * distinguishable from an explicit `--flag value`: this is exactly the
 * "flag at end-of-args or immediately followed by another --flag" signal the
 * guard rejects for value-required flags.
 */
const valuelessFlagMarker = `${String.fromCodePoint(0)}__valueless__`;
/*
 * --root is the universal repo-discovery override accepted by every repo-scoped
 * command, so it is always allowed and always value-required.
 */
const rootFlag = 'root';

const isFlag = (arg: string | undefined): boolean => arg?.startsWith(flagPrefix) === true;

const appendFlagValue = (flags: Map<string, Array<string>>, key: string, value: string): void => {
  const values = flags.get(key) ?? [];
  values.push(value);
  flags.set(key, values);
};

const flagValueAt = (
  args: ReadonlyArray<string>,
  index: number,
): { readonly consumedNext: boolean; readonly value: string } => {
  const next = args[index + 1];

  if (typeof next === 'string' && !isFlag(next)) {
    return { consumedNext: true, value: next };
  }

  return { consumedNext: false, value: valuelessFlagMarker };
};

const nextFlagIndex = (index: number, consumedNext: boolean): number => {
  if (consumedNext) {
    return index + flagPrefixLength;
  }

  return index + 1;
};

const consumeArg = (
  args: ReadonlyArray<string>,
  flags: Map<string, Array<string>>,
  positionals: Array<string>,
  index: number,
): number => {
  const arg = args[index];

  if (isFlag(arg)) {
    const key = String(arg).slice(flagPrefixLength);
    const parsed = flagValueAt(args, index);
    appendFlagValue(flags, key, parsed.value);
    return nextFlagIndex(index, parsed.consumedNext);
  }

  if (typeof arg === 'string') {
    positionals.push(arg);
  }

  return index + 1;
};

const parseFlags = (args: ReadonlyArray<string>): FlagParseResult => {
  const flags = new Map<string, Array<string>>();
  const positionals: Array<string> = [];
  let index = 0;

  while (index < args.length) {
    index = consumeArg(args, flags, positionals, index);
  }

  return { flags, positionals };
};

const flagValues = (
  flags: Map<string, ReadonlyArray<string>>,
  key: string,
): ReadonlyArray<string> => flags.get(key) ?? [];

const flagValueIsMissing = (value: string): boolean =>
  value.length === 0 || value === valuelessFlagMarker;

const assertValuedFlagHasValue = (
  flags: Map<string, ReadonlyArray<string>>,
  key: string,
  usage: string,
): void => {
  if (flagValues(flags, key).some(flagValueIsMissing)) {
    throw cliArgumentError(`--${key} requires a value.`, { flag: key, usage });
  }
};

/*
 * A boolean flag followed by a token greedily captures it (`--all true` =>
 * ['true']); the valueless sentinel cannot be supplied on the command line, so
 * rejecting any other value catches `--all false`, `--all true`, and
 * `--all nonsense`, keeping boolean semantics honest.
 */
const assertBooleanFlagHasNoValue = (
  flags: Map<string, ReadonlyArray<string>>,
  key: string,
  usage: string,
): void => {
  if (flagValues(flags, key).some((value) => value !== valuelessFlagMarker)) {
    throw cliArgumentError(`--${key} does not take a value.`, { flag: key, usage });
  }
};

const assertKnownFlags = (
  flags: Map<string, ReadonlyArray<string>>,
  spec: FlagSpec,
  usage: string,
): void => {
  const valued = new Set<string>([rootFlag, ...(spec.valued ?? [])]);
  const booleans = new Set<string>(spec.boolean ?? []);
  const allowed = new Set<string>([...valued, ...booleans]);

  for (const key of flags.keys()) {
    if (!allowed.has(key)) {
      throw cliArgumentError(`Unknown flag --${key}.`, { flag: key, usage });
    }
  }

  for (const key of valued) {
    assertValuedFlagHasValue(flags, key, usage);
  }

  for (const key of booleans) {
    assertBooleanFlagHasNoValue(flags, key, usage);
  }
};

/*
 * Run the strict structural pre-scan for a resolved command. `args` is the
 * command's own argv slice (after the command path and after the global --json
 * flag has been stripped). Throws an IntrospectionError carrying the stable
 * cli.* code on the first violation; returns normally when the args are
 * well-formed enough for Effect to parse.
 */
const preScan = (spec: FlagSpec, args: ReadonlyArray<string>): void => {
  const { flags, positionals } = parseFlags(args);

  /*
   * --root is the universal, value-required repo-discovery override. Validate its
   * shape regardless of strictFlags: the non-strict mutating commands (record
   * create/transition, ids repair, vocab *) skip assertKnownFlags, so without
   * this a valueless --root would be treated as absent and silently run against
   * the wrong repo — a write/mutation footgun. Unknown-flag rejection stays gated
   * by strictFlags below.
   */
  assertValuedFlagHasValue(flags, rootFlag, spec.usage);

  if (spec.strictFlags) {
    assertKnownFlags(flags, spec, spec.usage);
  }

  if (positionals.length > spec.maxPositionals) {
    throw cliUsageError(spec.usage, 'Command received unexpected arguments.', {
      arguments: positionals.slice(spec.maxPositionals),
    });
  }
};

const innerCliError = (error: CliError.CliError): CliError.CliError => {
  if (error._tag === 'ShowHelp' && error.errors.length > 0) {
    const [first] = error.errors;

    if (first) {
      return first;
    }
  }

  return error;
};

const cliErrorPayload = (
  inner: CliError.CliError,
): { code: string; message: string; details: ErrorDetails } => {
  switch (inner._tag) {
    case 'InvalidValue':
      return {
        code: 'cli.argument.invalid',
        message: `--${inner.option} value "${inner.value}" is not supported.`,
        details: { flag: inner.option, value: inner.value },
      };
    case 'UnrecognizedOption':
      return {
        code: 'cli.argument.invalid',
        message: `Unknown flag ${inner.option}.`,
        details: { flag: inner.option },
      };
    case 'MissingOption':
      return {
        code: 'cli.flag.required',
        message: `Missing required --${inner.option} value.`,
        details: { flag: inner.option },
      };
    case 'MissingArgument':
      return {
        code: 'cli.argument.required',
        message: 'Missing required argument.',
        details: {},
      };
    case 'UnknownSubcommand':
      return {
        code: 'cli.argument.invalid',
        message: 'Unknown command.',
        details: { command: inner.subcommand },
      };
    default:
      return {
        code: 'cli.argument.invalid',
        message: 'Command arguments are invalid.',
        details: {},
      };
  }
};

/*
 * Fold a typed Effect CliError back into the stable error payload taxonomy the
 * pre-cutover CLI used. Returns undefined for anything that is not a CliError so
 * the caller can treat it as an unexpected defect.
 */
const mapCliError = (error: unknown): CliErrorPayload | undefined => {
  if (!CliError.isCliError(error)) {
    return;
  }

  const { code, message, details } = cliErrorPayload(innerCliError(error));

  if (Object.keys(details).length > 0) {
    return { code, details, message };
  }

  return { code, message };
};

export { mapCliError, preScan };
export type { FlagSpec };
