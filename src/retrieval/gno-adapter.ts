import { deterministicSearch } from './retrieval-provider.js';

type RetrievalDocument = Parameters<typeof deterministicSearch>[0][number];
type RetrievalQuery = Parameters<typeof deterministicSearch>[1];
type RetrievalResult = ReturnType<typeof deterministicSearch>[number];

interface GnoSearchHit {
  readonly id?: string;
  readonly path: string;
  readonly text: string;
  readonly tags?: ReadonlyArray<string>;
  readonly visibility?: string;
}

interface GnoSearchClient {
  readonly search: (query: RetrievalQuery) => Promise<ReadonlyArray<GnoSearchHit>>;
}

interface RetrievalProvider {
  readonly name: string;
  search(query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>>;
}

const documentFromHit = (hit: GnoSearchHit): RetrievalDocument => ({
  id: hit.id ?? hit.path,
  path: hit.path,
  text: hit.text,
  tags: hit.tags ?? [],
  visibility: hit.visibility ?? 'local-only',
});

const createGnoRetrievalAdapter = (client: GnoSearchClient): RetrievalProvider => ({
  name: 'gno',
  search: async (query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>> => {
    const hits = await client.search(query);

    return deterministicSearch(hits.map(documentFromHit), query);
  },
});

export { createGnoRetrievalAdapter };
export type { GnoSearchClient, GnoSearchHit };
