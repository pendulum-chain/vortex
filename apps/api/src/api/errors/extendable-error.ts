interface ExtendableErrorParams {
  message: string;
  errors?: unknown[];
  status?: number;
  isPublic?: boolean;
  stack?: string;
  type?: string;
}

/**
 * Base error class that can be extended with additional properties
 * @extends Error
 */
class ExtendableError extends Error {
  readonly errors?: unknown[];

  readonly status?: number;

  readonly isPublic: boolean;

  readonly isOperational: boolean;

  readonly type?: string;

  constructor({ message, errors, status, isPublic = false, stack, type }: ExtendableErrorParams) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.errors = errors;
    this.status = status;
    this.isPublic = isPublic;
    this.isOperational = true;
    this.stack = stack;
    this.type = type;
    // Error.captureStackTrace(this, this.constructor.name);
  }
}

export default ExtendableError;
