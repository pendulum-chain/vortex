/**
 * @extends Error
 */
class ExtendableError extends Error {
  constructor({ message, errors, status, isPublic, stack }) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.errors = errors;
    this.status = status;
    this.isPublic = isPublic;
    this.isOperational = true;
    this.stack = stack;
    // Error.captureStackTrace(this, this.constructor.name);
  }
}

module.exports = ExtendableError;
