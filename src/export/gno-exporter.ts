import { createHash } from 'node:crypto';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringify } from 'yaml';

import { IntrospectionError } from '../core/errors.js';
import type { BaseRecordFrontmatter } from '../core/record-type.js';

import type { ExportRecordDocument } from './export-document.js';

interface GnoProjectionResult {
  readonly path: string;
  readonly recordCount: number;
  readonly sha256: string;
}

interface WriteGnoProjectionOptions {
  readonly outputDirectory: string;
  readonly records: ReadonlyArray<ExportRecordDocument>;
}

type GnoFrontmatter = Pick<
  BaseRecordFrontmatter,
  | 'category'
  | 'created_at'
  | 'id'
  | 'record_type'
  | 'status'
  | 'tags'
  | 'title'
  | 'type'
  | 'updated_at'
  | 'visibility'
>;

const markdownExtension = '.md';
const yamlLineWidth = 0;
const forbiddenPathComponents = new Set(['', '.', '..']);

const gnoFrontmatter = (record: ExportRecordDocument): GnoFrontmatter => ({
  id: record.frontmatter.id,
  title: record.frontmatter.title,
  record_type: record.frontmatter.record_type,
  type: record.frontmatter.type,
  category: record.frontmatter.category,
  status: record.frontmatter.status,
  visibility: record.frontmatter.visibility,
  created_at: record.frontmatter.created_at,
  updated_at: record.frontmatter.updated_at,
  tags: [...record.frontmatter.tags],
});

const renderGnoMarkdown = (record: ExportRecordDocument): string =>
  `---\n${stringify(gnoFrontmatter(record), { lineWidth: yamlLineWidth })}---\n${record.body}`;

const invalidProjectionComponentError = (component: string, recordId: string): IntrospectionError =>
  new IntrospectionError(
    'export.gno_projection.invalid_path_component',
    'GNO projection path component is not safe to write.',
    { component, recordId },
  );

const escapedProjectionRootError = (
  outputDirectory: string,
  absolutePath: string,
  recordId: string,
): IntrospectionError =>
  new IntrospectionError(
    'export.gno_projection.path_outside_root',
    'GNO projection path resolved outside the projection root.',
    { outputDirectory, path: absolutePath, recordId },
  );

const projectionCollisionError = (
  relativePath: string,
  recordId: string,
  existingRecordId: string,
): IntrospectionError =>
  new IntrospectionError(
    'export.gno_projection.path_collision',
    'GNO projection path collision would overwrite another record.',
    { existingRecordId, path: relativePath, recordId },
  );

const componentHasSeparator = (component: string): boolean =>
  component.includes('/') || component.includes('\\') || component.includes(path.sep);

const assertSafeProjectionComponent = (component: string, recordId: string): void => {
  if (
    forbiddenPathComponents.has(component) ||
    path.isAbsolute(component) ||
    componentHasSeparator(component)
  ) {
    throw invalidProjectionComponentError(component, recordId);
  }
};

const projectionFilename = (record: ExportRecordDocument): string => {
  const filename = `${record.id.toLowerCase()}${markdownExtension}`;
  assertSafeProjectionComponent(filename, record.id);

  return filename;
};

const projectionRelativePath = (record: ExportRecordDocument): string => {
  assertSafeProjectionComponent(record.recordType, record.id);
  assertSafeProjectionComponent(record.status, record.id);

  return path.join(record.recordType, record.status, projectionFilename(record));
};

const relativePathIsInsideRoot = (relativePath: string): boolean =>
  relativePath.length === 0 ||
  (!relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath));

const resolveProjectionPath = (
  outputDirectory: string,
  relativePath: string,
  recordId: string,
): string => {
  const absolutePath = path.resolve(outputDirectory, relativePath);
  const relativeFromRoot = path.relative(outputDirectory, absolutePath);

  if (!relativePathIsInsideRoot(relativeFromRoot)) {
    throw escapedProjectionRootError(outputDirectory, absolutePath, recordId);
  }

  return absolutePath;
};

const projectionPaths = (
  records: ReadonlyArray<ExportRecordDocument>,
): ReadonlyArray<{ readonly record: ExportRecordDocument; readonly relativePath: string }> => {
  const seen = new Map<string, string>();

  return records.map((record) => {
    const relativePath = projectionRelativePath(record);
    const existingRecordId = seen.get(relativePath);

    if (existingRecordId) {
      throw projectionCollisionError(relativePath, record.id, existingRecordId);
    }

    seen.set(relativePath, record.id);

    return { record, relativePath };
  });
};

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const writeProjectionRecord = async (
  outputDirectory: string,
  relativePath: string,
  record: ExportRecordDocument,
): Promise<string> => {
  const absolutePath = resolveProjectionPath(outputDirectory, relativePath, record.id);
  const content = renderGnoMarkdown(record);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, { encoding: 'utf8', flag: 'wx' });

  return `${relativePath}:${sha256(content)}`;
};

const writeProjectionRecords = async (
  outputDirectory: string,
  records: ReadonlyArray<ExportRecordDocument>,
): Promise<ReadonlyArray<string>> =>
  Promise.all(
    projectionPaths(records).map(async ({ record, relativePath }) =>
      writeProjectionRecord(outputDirectory, relativePath, record),
    ),
  );

const writeGnoProjection = async ({
  outputDirectory,
  records,
}: WriteGnoProjectionOptions): Promise<GnoProjectionResult> => {
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  const safeOutputDirectory = await realpath(outputDirectory);
  const hashes = await writeProjectionRecords(safeOutputDirectory, records);

  return {
    path: outputDirectory,
    recordCount: records.length,
    sha256: sha256([...hashes].sort().join('\n')),
  };
};

export { renderGnoMarkdown, writeGnoProjection };
export type { GnoProjectionResult, WriteGnoProjectionOptions };
