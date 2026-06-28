import { deterministicSearch } from './retrieval-provider.js';

type RetrievalDocument = Parameters<typeof deterministicSearch>[0][number];
type RetrievalQuery = Parameters<typeof deterministicSearch>[1];
type RetrievalResult = ReturnType<typeof deterministicSearch>[number];

interface RetrievalProvider {
  readonly name: string;
  search(query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>>;
}

const createDeterministicRetrievalProvider = (
  documents: ReadonlyArray<RetrievalDocument>,
): RetrievalProvider => ({
  name: 'deterministic',
  search: async (query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>> =>
    deterministicSearch(documents, query),
});

export { createDeterministicRetrievalProvider };
