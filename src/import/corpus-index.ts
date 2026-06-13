import path from 'node:path';

import type { RepoContext } from '../config/repo-context.js';
import { maxRecordNumber, parseRecordId } from '../core/id.js';
import type { ParsedRecord, RecordType } from '../core/record-type-types.js';
import type { RecordReadFailure, RecordReadResult } from '../core/validation.js';

const markdownExtension = '.md';

interface OccupiedIdentity {
  readonly id: string;
  readonly number: number;
  readonly relativePath: string;
}

interface CorpusIndex {
  readonly results: ReadonlyArray<RecordReadResult>;
  readonly readableRecords: ReadonlyArray<ParsedRecord>;
  readonly occupiedById: ReadonlyMap<string, OccupiedIdentity>;
}

const isReadFailure = (result: RecordReadResult): result is RecordReadFailure => !result.ok;

/*
 * An unreadable existing record still owns the ID and number encoded in its canonical path
 * (recordType/status/<id>.md). Recovering them from the path — without parsing the broken
 * body — lets ID-collision detection and allocate numbering honor records the corpus reader
 * could not parse, so an import never re-mints an ID or number an on-disk record already owns.
 * A failed read whose filename does not parse as this type's ID (a stray file, or another
 * record type) cannot collide by ID or number here; the path-existence probe still guards it.
 */
const inferOccupiedIdentity = (
  failure: RecordReadFailure,
  repo: RepoContext,
  recordType: RecordType,
): OccupiedIdentity | null => {
  const relativePath = failure.relativePath ?? failure.inputPath;
  const fileName = path.basename(relativePath);

  if (!fileName.endsWith(markdownExtension)) {
    return null;
  }

  const idCandidate = fileName.slice(0, -markdownExtension.length).toUpperCase();
  const parsed = parseRecordId(idCandidate, repo.repoKey, recordType.idPrefix);

  if (!parsed) {
    return null;
  }

  return { id: parsed.id, number: parsed.number, relativePath };
};

const occupiedIdentities = (
  results: ReadonlyArray<RecordReadResult>,
  repo: RepoContext,
  recordType: RecordType,
): ReadonlyArray<OccupiedIdentity> =>
  results
    .filter(isReadFailure)
    .map((failure) => inferOccupiedIdentity(failure, repo, recordType))
    .filter((identity): identity is OccupiedIdentity => identity !== null);

const indexCorpus = (
  results: ReadonlyArray<RecordReadResult>,
  repo: RepoContext,
  recordType: RecordType,
): CorpusIndex => {
  const readableRecords = results.filter((result) => result.ok).map((result) => result.record);
  const occupied = occupiedIdentities(results, repo, recordType);

  return {
    results,
    readableRecords,
    occupiedById: new Map(occupied.map((identity) => [identity.id, identity])),
  };
};

/*
 * The next free number must clear both the readable records and any unreadable record whose
 * canonical path reveals a number, so allocate never reuses a number an existing record owns.
 */
const allocationBase = (corpus: CorpusIndex, repo: RepoContext, recordType: RecordType): number => {
  const maxReadable = maxRecordNumber(corpus.readableRecords, {
    recordType,
    repoKey: repo.repoKey,
  });
  const maxOccupied = [...corpus.occupiedById.values()].reduce(
    (max, identity) => Math.max(max, identity.number),
    0,
  );

  return Math.max(maxReadable, maxOccupied) + 1;
};

export { allocationBase, indexCorpus };
export type { CorpusIndex, OccupiedIdentity };
