import { NextFunction, Request, Response } from "express";
import { ValidationError } from "express-validation";
import httpStatus from "http-status";

import { config } from "../../config/vars";
import { APIError } from "../errors/api-error";

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
const handler = (err: APIError | Error, _req: Request, res: Response, _next: NextFunction): void => {
  const apiError = err as APIError;
  const response: ErrorResponse = {
    code: apiError.status || httpStatus.INTERNAL_SERVER_ERROR,
    errors: apiError.errors,
    message: apiError.message || httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
    stack: err.stack
  };

  if (env !== "development") {
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
      errors: err.errors,
      message: "Validation Error",
      // @ts-ignore
      stack: err.stack,
      status: err.status
    });
  } else if (!(err instanceof APIError)) {
    convertedError = new APIError({
      message: err.message,
      stack: err.stack,
      status: (err instanceof APIError ? err.status : httpStatus.INTERNAL_SERVER_ERROR) as number
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
    message: "Not found",
    status: httpStatus.NOT_FOUND
  });
  return handler(err, req, res, next);
};
