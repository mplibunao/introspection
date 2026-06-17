const tagPattern = /^[a-z0-9][a-z0-9.-]*(?:\/[a-z0-9][a-z0-9.-]*)*$/u;
const machineOwnedTagPrefixes = ['record/', 'repo/', 'status/', 'visibility/'] as const;

type MachineOwnedTagPrefix = (typeof machineOwnedTagPrefixes)[number];

const tagConformsToGrammar = (tag: string): boolean => tagPattern.test(tag);

const tagIsMachineOwned = (tag: string): boolean =>
  machineOwnedTagPrefixes.some((prefix) => tag.startsWith(prefix));

const tagHasNamespace = (tag: string, namespace: string): boolean =>
  tag.startsWith(`${namespace}/`);

const rawVocabularyTags = (tags: ReadonlyArray<string>): ReadonlyArray<string> =>
  tags.filter((tag) => !tagIsMachineOwned(tag));

export {
  machineOwnedTagPrefixes,
  rawVocabularyTags,
  tagConformsToGrammar,
  tagHasNamespace,
  tagIsMachineOwned,
};
export type { MachineOwnedTagPrefix };
