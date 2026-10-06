import httpStatus from "http-status";

interface APIErrorParams {
  message: string;
  errors?: unknown[];
  stack?: string;
  status?: number;
  isPublic?: boolean;
  type?: string;
}

/**
 * Class representing an API error.
 * @extends Error
 */
export class APIError extends Error {
  readonly errors?: unknown[];

  readonly status?: number;

  readonly isPublic: boolean;

  readonly isOperational: boolean;

  readonly type?: string;

  /**
   * Creates an API error.
   * @param {string} message - Error message.
   * @param {number} status - HTTP status code of error.
   * @param {boolean} isPublic - Whether the message should be visible to user or not.
   */
  constructor({ message, errors, stack, status = httpStatus.INTERNAL_SERVER_ERROR, isPublic = false, type }: APIErrorParams) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.errors = errors;
    this.status = status;
    this.isPublic = isPublic;
    this.isOperational = true;
    this.stack = stack;
    this.type = type;
  }
}
