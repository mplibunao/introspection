import { parseDocument, stringify } from 'yaml';

import { FrontmatterParseError, FrontmatterValidationError } from '../core/errors.js';
import type { BaseRecordFrontmatter, ParsedRecord } from '../core/record-type-types.js';

const frontmatterBlockPattern =
  /^---[ \t]*\r?\n(?<frontmatter>[\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)(?<body>[\s\S]*)$/u;

const requiredBaseFields = [
  'schema_version',
  'id',
  'repo_key',
  'record_type',
  'number',
  'title',
  'status',
  'type',
  'category',
  'visibility',
  'created_at',
  'updated_at',
  'tags',
] as const satisfies ReadonlyArray<keyof BaseRecordFrontmatter>;

type RequiredBaseField = (typeof requiredBaseFields)[number];
type FrontmatterObject = Record<string, unknown>;
type BaseFrontmatterAssertion = (
  frontmatter: FrontmatterObject,
  path?: string,
) => asserts frontmatter is BaseRecordFrontmatter & FrontmatterObject;

interface MarkdownRecordParts {
  readonly frontmatterSource: string;
  readonly body: string;
}

const frontmatterOpeningPattern = /^---[ \t]*\r?\n/u;
const utf8BomPattern = /^\uFEFF/u;

const isObject = (value: unknown): value is FrontmatterObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typeName = (value: unknown): string => {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value;
};

const requiredFieldValidator = (field: RequiredBaseField, value: unknown): string | null => {
  switch (field) {
    case 'schema_version':
    case 'number':
      if (Number.isInteger(value)) {
        return null;
      }

      return 'integer';
    case 'tags':
      if (Array.isArray(value) && value.every((tag) => typeof tag === 'string')) {
        return null;
      }

      return 'string array';
    case 'type':
      if (value === 'introspection-record') {
        return null;
      }

      return 'introspection-record';
    default:
      if (typeof value === 'string' && value.length > 0) {
        return null;
      }

      return 'non-empty string';
  }
};

const requiredFieldIsMissing = (
  frontmatter: FrontmatterObject,
  field: RequiredBaseField,
): boolean => !(field in frontmatter);

const validateBaseFrontmatter: BaseFrontmatterAssertion = (frontmatter, path) => {
  const missingFields = requiredBaseFields.filter((field) =>
    requiredFieldIsMissing(frontmatter, field),
  );

  if (missingFields.length > 0) {
    throw new FrontmatterValidationError(
      `Record frontmatter is missing required field(s): ${missingFields.join(', ')}.`,
      { missingFields, path },
    );
  }

  const invalidFields = requiredBaseFields.flatMap((field) => {
    const expectedType = requiredFieldValidator(field, frontmatter[field]);

    if (!expectedType) {
      return [];
    }

    return [{ field, expectedType, actualType: typeName(frontmatter[field]) }];
  });

  if (invalidFields.length > 0) {
    throw new FrontmatterValidationError('Record frontmatter has invalid required field values.', {
      invalidFields,
      path,
    });
  }
};

const parseFrontmatterObject = (source: string, path?: string): FrontmatterObject => {
  const document = parseDocument(source, { prettyErrors: false });

  if (document.errors.length > 0) {
    throw new FrontmatterParseError('Record frontmatter YAML could not be parsed.', {
      errors: document.errors.map((error) => error.message),
      path,
    });
  }

  const value = document.toJSON();

  if (!isObject(value)) {
    throw new FrontmatterValidationError('Record frontmatter must be a YAML mapping.', {
      actualType: typeName(value),
      path,
    });
  }

  return value;
};

const readMarkdownRecordGroups = (
  groups: Record<string, string>,
  path?: string,
): MarkdownRecordParts => {
  const frontmatterSource = groups['frontmatter'];
  const { body } = groups;

  if (typeof frontmatterSource !== 'string' || typeof body !== 'string') {
    throw new FrontmatterParseError('Record markdown frontmatter block could not be read.', {
      path,
    });
  }

  return { frontmatterSource, body };
};

const parseMarkdownRecordParts = (content: string, path?: string): MarkdownRecordParts => {
  if (!frontmatterOpeningPattern.test(content)) {
    throw new FrontmatterParseError('Record markdown must start with a YAML frontmatter block.', {
      path,
    });
  }

  const match = frontmatterBlockPattern.exec(content);

  if (!match?.groups) {
    throw new FrontmatterParseError('Record markdown is missing a closing frontmatter delimiter.', {
      path,
    });
  }

  return readMarkdownRecordGroups(match.groups, path);
};

const attachPath = (record: ParsedRecord, path?: string): ParsedRecord => {
  if (typeof path === 'string') {
    return { ...record, path };
  }

  return record;
};

const stripUtf8Bom = (content: string): string => content.replace(utf8BomPattern, '');

const parseMarkdownRecord = (content: string, path?: string): ParsedRecord => {
  const { frontmatterSource, body } = parseMarkdownRecordParts(stripUtf8Bom(content), path);
  const frontmatter = parseFrontmatterObject(frontmatterSource, path);
  validateBaseFrontmatter(frontmatter, path);

  return attachPath({ frontmatter, body }, path);
};

const normalizeYaml = (yamlText: string): string => {
  if (yamlText.endsWith('\n')) {
    return yamlText;
  }

  return `${yamlText}\n`;
};

const renderMarkdownRecord = (record: ParsedRecord): string => {
  const yamlText = normalizeYaml(stringify(record.frontmatter, { lineWidth: 0 }));

  return `---\n${yamlText}---\n${record.body}`;
};

export { parseMarkdownRecord, renderMarkdownRecord, validateBaseFrontmatter };
