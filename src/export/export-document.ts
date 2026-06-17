import type { RepoContext } from '../config/repo-context.js';
import type { ExportDocument, ValidationContext } from '../core/record-type.js';
import type { RecordTypeRegistry } from '../core/record-type-types.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';

interface ExportRecordDocument extends ExportDocument {
  readonly path: string;
}

interface ExportManifestEntry {
  readonly kind: 'gno-markdown' | 'json';
  readonly path: string;
  readonly record_count: number;
  readonly sha256?: string;
}

interface ExportManifest {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly generator: {
    readonly name: '@mplibunao/introspection';
    readonly version: string;
  };
  readonly repo: {
    readonly key: string;
    readonly slug: string;
  };
  readonly records_root: string;
  readonly exports: ReadonlyArray<ExportManifestEntry>;
}

interface BuildExportDocumentsOptions {
  readonly context: ValidationContext;
  readonly records: ReadonlyArray<StoredMarkdownRecord>;
  readonly registry: RecordTypeRegistry;
}

interface BuildExportManifestOptions {
  readonly entries: ReadonlyArray<ExportManifestEntry>;
  readonly generatedAt: Date;
  readonly repo: RepoContext;
  readonly version: string;
}

const byStableExportOrder = (left: ExportRecordDocument, right: ExportRecordDocument): number => {
  const idOrder = left.id.localeCompare(right.id);

  if (idOrder !== 0) {
    return idOrder;
  }

  return left.path.localeCompare(right.path);
};

const buildExportDocuments = ({
  context,
  records,
  registry,
}: BuildExportDocumentsOptions): ReadonlyArray<ExportRecordDocument> =>
  records
    .map((record) => ({
      ...registry.require(record.frontmatter.record_type).projectForExport(record, context),
      path: record.relativePath,
    }))
    .sort(byStableExportOrder);

const isoTimestamp = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/u, 'Z');

const buildExportManifest = ({
  entries,
  generatedAt,
  repo,
  version,
}: BuildExportManifestOptions): ExportManifest => ({
  schema_version: 1,
  generated_at: isoTimestamp(generatedAt),
  generator: {
    name: '@mplibunao/introspection',
    version,
  },
  repo: {
    key: repo.repoKey,
    slug: repo.repoSlug,
  },
  records_root: repo.recordsRoot,
  exports: entries,
});

export { buildExportDocuments, buildExportManifest };
export type { ExportManifest, ExportManifestEntry, ExportRecordDocument };
