import { Flag } from 'effect/unstable/cli';

/*
 * Shared `--root` repo-discovery override for every command that loads repo
 * context. Keeping one option definition preserves the same description and
 * parsing shape across read and mutation commands.
 */
const rootFlagOption = Flag.string('root').pipe(
  Flag.withDescription('Discover the repo from this path instead of the working directory.'),
  Flag.optional,
);

export { rootFlagOption };
