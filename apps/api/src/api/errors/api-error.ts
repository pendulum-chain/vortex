import httpStatus from "http-status";
import ExtendableError from "./extendable-error";

interface APIErrorParams {
  message: string;
  errors?: unknown[];
  stack?: string;
  status?: number;
  isPublic?: boolean;
}

/**
 * Class representing an API error.
 * @extends ExtendableError
 */
export class APIError extends ExtendableError {
  /**
   * Creates an API error.
   * @param {string} message - Error message.
   * @param {number} status - HTTP status code of error.
   * @param {boolean} isPublic - Whether the message should be visible to user or not.
   */
  constructor({ message, errors, stack, status = httpStatus.INTERNAL_SERVER_ERROR, isPublic = false }: APIErrorParams) {
    super({
      errors,
      isPublic,
      message,
      stack,
      status
    });
  }
}
