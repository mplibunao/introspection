/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { deterministicSearch } from './retrieval-provider.js';
import type {
  RetrievalDocument,
  RetrievalProvider,
  RetrievalQuery,
  RetrievalResult,
} from './retrieval-provider.js';

const createDeterministicRetrievalProvider = (
  documents: ReadonlyArray<RetrievalDocument>,
): RetrievalProvider => ({
  name: 'deterministic',
  search: async (query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>> =>
    deterministicSearch(documents, query),
});

export { createDeterministicRetrievalProvider };
