type ErrorDetails = Readonly<Record<string, unknown>>;

class IntrospectionError extends Error {
  readonly code: string;
  readonly details: ErrorDetails;

  constructor(code: string, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

class FrontmatterParseError extends IntrospectionError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('frontmatter.parse_error', message, details);
  }
}

class FrontmatterValidationError extends IntrospectionError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('frontmatter.validation_error', message, details);
  }
}

class RecordStoreError extends IntrospectionError {
  constructor(code: string, message: string, details: ErrorDetails = {}) {
    super(code, message, details);
  }
}

class StaleRecordError extends RecordStoreError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('record_store.stale_record', message, details);
  }
}

export {
  FrontmatterParseError,
  FrontmatterValidationError,
  IntrospectionError,
  RecordStoreError,
  StaleRecordError,
};
export type { ErrorDetails };
