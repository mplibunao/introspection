import { constants as fsConstants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseToml } from 'toml';

import baseRecordSchema from '../../schemas/base-record.schema.json';
import configSchema from '../../schemas/config.schema.json';
import vocabularySchema from '../../schemas/vocabulary.schema.json';
import { IntrospectionError } from '../core/errors.js';
import type { JsonObject, Visibility } from '../core/record-type-types.js';

interface ConfigRecords {
  readonly root: string;
}

interface ConfigDefaults {
  readonly visibility: Visibility;
}

interface ConfigPrimeDefaults {
  readonly default_limit?: number;
  readonly hard_limit?: number;
}

interface PolicyDocPointer {
  readonly name: string;
  readonly path: string;
  readonly applies_to?: ReadonlyArray<string>;
}

interface ResolvedPolicyDocPointer extends PolicyDocPointer {
  readonly relativePath: string;
}

interface IntrospectionConfig {
  readonly $schema?: string;
  readonly schema_version: 1;
  readonly repo_key: string;
  readonly repo_slug: string;
  readonly records: ConfigRecords;
  readonly defaults: ConfigDefaults;
  readonly prime?: ConfigPrimeDefaults;
  readonly policy_docs?: ReadonlyArray<PolicyDocPointer>;
}

interface VocabularyProvenance {
  readonly kind: 'human' | 'import' | 'other' | 'plan' | 'record' | 'seed';
  readonly ref: string;
  readonly noted_at?: string;
}

interface VocabularyTerm {
  readonly tag: string;
  readonly status: 'approved' | 'provisional' | 'rejected';
  readonly description: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly applies_to?: ReadonlyArray<string>;
  readonly provenance: VocabularyProvenance;
}

interface IntrospectionVocabulary {
  readonly $schema?: string;
  readonly schema_version: 1;
  readonly terms: ReadonlyArray<VocabularyTerm>;
}

interface RepoContext {
  readonly repoRoot: string;
  readonly introspectionRoot: string;
  readonly configPath: string;
  readonly vocabularyPath: string;
  readonly locksRoot: string;
  readonly repoKey: string;
  readonly repoSlug: string;
  readonly recordsRoot: string;
  readonly defaultVisibility: Visibility;
  readonly policyDocs: ReadonlyArray<ResolvedPolicyDocPointer>;
  readonly config: IntrospectionConfig;
  readonly vocabulary: IntrospectionVocabulary;
}

interface LoadRepoContextOptions {
  readonly cwd?: string;
}

const introspectionDirectoryName = '.introspection';
const configFileName = 'config.toml';
const vocabularyFileName = 'vocabulary.toml';
class ConfigLoadError extends IntrospectionError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMissingPathError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const makeAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(baseRecordSchema);
  ajv.addSchema(configSchema);
  ajv.addSchema(vocabularySchema);

  return ajv;
};

const schemaValidator = (schemaId: string): ValidateFunction => {
  const validate = makeAjv().getSchema(schemaId);

  if (!validate) {
    throw new ConfigLoadError(
      'config.schema_unavailable',
      'Config schema validator could not be created.',
      { schemaId },
    );
  }

  return validate;
};

const configValidator = (): ValidateFunction => schemaValidator(configSchema.$id);
const vocabularyValidator = (): ValidateFunction => schemaValidator(vocabularySchema.$id);

const existingDirectoryFor = async (startPath: string): Promise<string> => {
  const absoluteStartPath = path.resolve(startPath);

  try {
    const startStat = await stat(absoluteStartPath);

    if (startStat.isDirectory()) {
      return absoluteStartPath;
    }

    return path.dirname(absoluteStartPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return absoluteStartPath;
    }

    throw error;
  }
};

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath, fsConstants.F_OK);

    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

const configPathFor = (directory: string): string =>
  path.join(directory, introspectionDirectoryName, configFileName);

const introspectionRootFor = (repoRoot: string): string =>
  path.join(repoRoot, introspectionDirectoryName);

const vocabularyPathFor = (introspectionRoot: string): string =>
  path.join(introspectionRoot, vocabularyFileName);

const locksRootFor = (introspectionRoot: string): string => path.join(introspectionRoot, '.locks');

const findConfigPath = async (cwd = process.cwd()): Promise<string> => {
  let directory = await existingDirectoryFor(cwd);

  while (true) {
    const candidatePath = configPathFor(directory);

    if (await pathExists(candidatePath)) {
      return candidatePath;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new ConfigLoadError(
        'config.not_found',
        'No .introspection/config.toml found in the current directory or its ancestors.',
        { cwd: path.resolve(cwd) },
      );
    }

    directory = parent;
  }
};

const repoRootForConfigPath = (configPath: string): string =>
  path.dirname(path.dirname(configPath));

const errorCodePrefix = (fileKind: 'config' | 'vocabulary'): string => {
  if (fileKind === 'config') {
    return 'config';
  }

  return 'vocabulary';
};

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const readTomlSource = async (
  filePath: string,
  fileKind: 'config' | 'vocabulary',
): Promise<string> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new ConfigLoadError(
        `${errorCodePrefix(fileKind)}.not_found`,
        `${fileKind} TOML file was not found.`,
        {
          path: filePath,
        },
      );
    }

    throw new ConfigLoadError(
      `${errorCodePrefix(fileKind)}.read_failed`,
      `${fileKind} TOML file could not be read.`,
      {
        path: filePath,
        message: parseErrorMessage(error),
      },
    );
  }
};

const parseTomlFile = async (
  filePath: string,
  fileKind: 'config' | 'vocabulary',
): Promise<JsonObject> => {
  const source = await readTomlSource(filePath, fileKind);

  try {
    const value = parseToml(source);

    if (!isObject(value)) {
      throw new ConfigLoadError(
        `${errorCodePrefix(fileKind)}.invalid_shape`,
        `${fileKind} TOML must decode to an object.`,
        { path: filePath },
      );
    }

    return value;
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      throw error;
    }

    throw new ConfigLoadError(
      `${errorCodePrefix(fileKind)}.invalid_toml`,
      `${fileKind} TOML could not be parsed.`,
      { path: filePath, message: parseErrorMessage(error) },
    );
  }
};

const schemaViolationError = (
  validate: ValidateFunction,
  fileKind: 'config' | 'vocabulary',
  filePath: string,
): ConfigLoadError =>
  new ConfigLoadError(
    `${errorCodePrefix(fileKind)}.schema_violation`,
    `${fileKind} TOML failed JSON Schema validation.`,
    { path: filePath, errors: validate.errors },
  );

const isConfigShape = (value: unknown, validate: ValidateFunction): value is IntrospectionConfig =>
  validate(value);

const isVocabularyShape = (
  value: unknown,
  validate: ValidateFunction,
): value is IntrospectionVocabulary => validate(value);

const loadConfigFile = async (configPath: string): Promise<IntrospectionConfig> => {
  const decodedConfig = await parseTomlFile(configPath, 'config');
  const validate = configValidator();

  if (isConfigShape(decodedConfig, validate)) {
    return decodedConfig;
  }

  throw schemaViolationError(validate, 'config', configPath);
};

const loadVocabularyFile = async (vocabularyPath: string): Promise<IntrospectionVocabulary> => {
  const decodedVocabulary = await parseTomlFile(vocabularyPath, 'vocabulary');
  const validate = vocabularyValidator();

  if (isVocabularyShape(decodedVocabulary, validate)) {
    return decodedVocabulary;
  }

  throw schemaViolationError(validate, 'vocabulary', vocabularyPath);
};

const relativePathIsInsideOrEqualRoot = (relativePath: string): boolean =>
  relativePath.length === 0 ||
  (!relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath));

const pathOutsideRepoRootError = (
  repoRoot: string,
  configuredPath: string,
  fieldName: string,
  details: Record<string, unknown> = {},
): ConfigLoadError =>
  new ConfigLoadError(
    'config.path_outside_repo_root',
    `${fieldName} must resolve inside the discovered repo root.`,
    { fieldName, path: configuredPath, repoRoot, ...details },
  );

const absoluteRepoConfigPathError = (configuredPath: string, fieldName: string): ConfigLoadError =>
  new ConfigLoadError(
    'config.absolute_path',
    `${fieldName} must be a repo-relative path, not an absolute path.`,
    { fieldName, path: configuredPath },
  );

const resolveRelativeUnderRepoRoot = (
  repoRoot: string,
  configuredPath: string,
  fieldName: string,
): string => {
  if (path.isAbsolute(configuredPath)) {
    throw absoluteRepoConfigPathError(configuredPath, fieldName);
  }

  const absolutePath = path.resolve(repoRoot, configuredPath);
  const relativePath = path.relative(repoRoot, absolutePath);

  if (!relativePathIsInsideOrEqualRoot(relativePath)) {
    throw pathOutsideRepoRootError(repoRoot, configuredPath, fieldName);
  }

  return absolutePath;
};

const nearestExistingAncestor = async (absolutePath: string): Promise<string> => {
  let candidatePath = absolutePath;

  while (!(await pathExists(candidatePath))) {
    const parent = path.dirname(candidatePath);

    if (parent === candidatePath) {
      return candidatePath;
    }

    candidatePath = parent;
  }

  return candidatePath;
};

const assertRealPathInsideRepoRoot = async (
  repoRoot: string,
  configuredPath: string,
  fieldName: string,
  absolutePath: string,
): Promise<void> => {
  const repoRootRealPath = await realpath(repoRoot);
  const existingAncestor = await nearestExistingAncestor(absolutePath);
  const existingAncestorRealPath = await realpath(existingAncestor);
  const relativeRealPath = path.relative(repoRootRealPath, existingAncestorRealPath);

  if (!relativePathIsInsideOrEqualRoot(relativeRealPath)) {
    throw pathOutsideRepoRootError(repoRoot, configuredPath, fieldName, {
      existingAncestor,
      existingAncestorRealPath,
      repoRootRealPath,
    });
  }
};

const resolveSafeRepoPath = async (
  repoRoot: string,
  configuredPath: string,
  fieldName: string,
): Promise<string> => {
  const absolutePath = resolveRelativeUnderRepoRoot(repoRoot, configuredPath, fieldName);
  // The lexical check blocks obvious `../` escapes. The realpath check blocks symlinked targets or parent segments from handing downstream services a path outside the repo.
  await assertRealPathInsideRepoRoot(repoRoot, configuredPath, fieldName, absolutePath);

  return absolutePath;
};

const resolveRecordsRoot = async (repoRoot: string, configuredPath: string): Promise<string> =>
  resolveSafeRepoPath(repoRoot, configuredPath, 'records.root');

const resolvePolicyDoc = async (
  repoRoot: string,
  policyDoc: PolicyDocPointer,
): Promise<ResolvedPolicyDocPointer> => {
  await resolveSafeRepoPath(repoRoot, policyDoc.path, 'policy_docs.path');

  return {
    ...policyDoc,
    relativePath: path.normalize(policyDoc.path),
  };
};

const resolvePolicyDocs = async (
  repoRoot: string,
  policyDocs: ReadonlyArray<PolicyDocPointer> = [],
): Promise<ReadonlyArray<ResolvedPolicyDocPointer>> =>
  Promise.all(policyDocs.map(async (policyDoc) => resolvePolicyDoc(repoRoot, policyDoc)));

const loadRepoContext = async (options: LoadRepoContextOptions = {}): Promise<RepoContext> => {
  const configPath = await findConfigPath(options.cwd);
  const repoRoot = repoRootForConfigPath(configPath);
  const introspectionRoot = introspectionRootFor(repoRoot);
  const vocabularyPath = vocabularyPathFor(introspectionRoot);
  const locksRoot = locksRootFor(introspectionRoot);
  const config = await loadConfigFile(configPath);
  const vocabulary = await loadVocabularyFile(vocabularyPath);
  const recordsRoot = await resolveRecordsRoot(repoRoot, config.records.root);

  return {
    repoRoot,
    introspectionRoot,
    configPath,
    vocabularyPath,
    locksRoot,
    repoKey: config.repo_key,
    repoSlug: config.repo_slug,
    recordsRoot,
    defaultVisibility: config.defaults.visibility,
    policyDocs: await resolvePolicyDocs(repoRoot, config.policy_docs),
    config,
    vocabulary,
  };
};

export { ConfigLoadError, findConfigPath, loadConfigFile, loadRepoContext, loadVocabularyFile };
export type {
  ConfigDefaults,
  ConfigPrimeDefaults,
  ConfigRecords,
  IntrospectionConfig,
  IntrospectionVocabulary,
  LoadRepoContextOptions,
  PolicyDocPointer,
  RepoContext,
  ResolvedPolicyDocPointer,
  VocabularyProvenance,
  VocabularyTerm,
};
