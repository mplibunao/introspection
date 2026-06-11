interface RetrievalDocument {
  readonly id: string;
  readonly path: string;
  readonly text: string;
  readonly tags: ReadonlyArray<string>;
  readonly visibility: string;
}

interface RetrievalQuery {
  readonly text: string;
  readonly limit?: number;
  readonly tagsAll?: ReadonlyArray<string>;
  readonly tagsAny?: ReadonlyArray<string>;
}

interface RetrievalResult {
  readonly document: RetrievalDocument;
  readonly score: number;
}

interface RetrievalProvider {
  readonly name: string;
  search(query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>>;
}

const defaultRetrievalLimit = 10;

const effectiveLimit = (limit: number | undefined): number => {
  if (typeof limit === 'number') {
    return Math.max(0, Math.trunc(limit));
  }

  return defaultRetrievalLimit;
};

const tagsAllMatch = (
  document: RetrievalDocument,
  tagsAll: ReadonlyArray<string> | undefined,
): boolean => !tagsAll || tagsAll.every((tag) => document.tags.includes(tag));

const tagsAnyMatch = (
  document: RetrievalDocument,
  tagsAny: ReadonlyArray<string> | undefined,
): boolean =>
  !tagsAny || tagsAny.length === 0 || tagsAny.some((tag) => document.tags.includes(tag));

const lexicalScore = (document: RetrievalDocument, queryText: string): number => {
  const normalizedQuery = queryText.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return 1;
  }

  const haystack = `${document.id} ${document.path} ${document.text}`.toLowerCase();

  if (haystack.includes(normalizedQuery)) {
    return 1;
  }

  return 0;
};

const byRetrievalOrder = (left: RetrievalResult, right: RetrievalResult): number => {
  const scoreOrder = right.score - left.score;

  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const idOrder = left.document.id.localeCompare(right.document.id);

  if (idOrder !== 0) {
    return idOrder;
  }

  return left.document.path.localeCompare(right.document.path);
};

const deterministicSearch = (
  documents: ReadonlyArray<RetrievalDocument>,
  query: RetrievalQuery,
): ReadonlyArray<RetrievalResult> =>
  documents
    .filter((document) => tagsAllMatch(document, query.tagsAll))
    .filter((document) => tagsAnyMatch(document, query.tagsAny))
    .map((document) => ({ document, score: lexicalScore(document, query.text) }))
    .filter((result) => result.score > 0)
    .sort(byRetrievalOrder)
    .slice(0, effectiveLimit(query.limit));

export { deterministicSearch };
export type { RetrievalDocument, RetrievalProvider, RetrievalQuery, RetrievalResult };
