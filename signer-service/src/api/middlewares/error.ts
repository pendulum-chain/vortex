import httpStatus from 'http-status';
import { ValidationError } from 'express-validation';
import { Request, Response, NextFunction } from 'express';

import { APIError } from '../errors/api-error';
import { config } from '../../config/vars';

const { env } = config;

interface ErrorResponse {
  code: number;
  message: string;
  errors?: unknown[];
  stack?: string;
}

/**
 * Error handler. Send stacktrace only during development
 * @public
 */
const handler = (err: APIError | Error, req: Request, res: Response, next: NextFunction): void => {
  const apiError = err as APIError;
  const response: ErrorResponse = {
    code: apiError.status || httpStatus.INTERNAL_SERVER_ERROR,
    message: apiError.message || httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
    errors: apiError.errors,
    stack: err.stack,
  };

  if (env !== 'development') {
    delete response.stack;
  }

  res.status(apiError.status || httpStatus.INTERNAL_SERVER_ERROR);
  res.json(response);
};

export { handler };

/**
 * If error is not an instanceOf APIError, convert it.
 * @public
 */
export const converter = (err: Error | ValidationError, req: Request, res: Response, next: NextFunction): void => {
  let convertedError: APIError;

  if (err instanceof ValidationError) {
    convertedError = new APIError({
      message: 'Validation Error',
      errors: err.errors,
      status: err.status,
      // @ts-ignore
      stack: err.stack,
    });
  } else if (!(err instanceof APIError)) {
    convertedError = new APIError({
      message: err.message,
      status: (err as any).status || httpStatus.INTERNAL_SERVER_ERROR,
      stack: err.stack,
    });
  } else {
    convertedError = err;
  }

  return handler(convertedError, req, res, next);
};

/**
 * Catch 404 and forward to error handler
 * @public
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const err = new APIError({
    message: 'Not found',
    status: httpStatus.NOT_FOUND,
  });
  return handler(err, req, res, next);
};
