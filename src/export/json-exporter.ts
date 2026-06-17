import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ExportManifest, ExportRecordDocument } from './export-document.js';

interface JsonExportPayload {
  readonly manifest: ExportManifest;
  readonly records: ReadonlyArray<ExportRecordDocument>;
}

interface WriteJsonExportOptions {
  readonly manifest: ExportManifest;
  readonly outputPath: string;
  readonly records: ReadonlyArray<ExportRecordDocument>;
}

const jsonIndent = 2;

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, jsonIndent)}\n`;

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const writeJsonExport = async ({
  manifest,
  outputPath,
  records,
}: WriteJsonExportOptions): Promise<{ readonly path: string; readonly sha256: string }> => {
  const payload: JsonExportPayload = { manifest, records };
  const content = stableJson(payload);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf8');

  return { path: outputPath, sha256: sha256(content) };
};

export { stableJson, writeJsonExport };
export type { JsonExportPayload, WriteJsonExportOptions };
