import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { isProduction } from '../config/constants.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../utils/app-error.js';

interface NormalisedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  isOperational: boolean;
}

function normaliseError(error: unknown): NormalisedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: true,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request payload failed validation',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      code: 'DATABASE_VALIDATION_ERROR',
      message: 'The document could not be saved because it failed schema validation',
      details: Object.values(error.errors).map((fieldError) => fieldError.message),
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: 'INVALID_IDENTIFIER',
      message: `"${error.value}" is not a valid value for ${error.path}`,
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is unreachable',
      isOperational: true,
    };
  }

  /*
   * A serverless instance can accept a request before its Mongo socket is up.
   * Mongoose then either buffers past the timeout or reports a closed
   * connection; both mean "retry shortly", not "the request was invalid".
   */
  if (
    error instanceof Error &&
    /buffering timed out|client must be connected|connection .* was disconnected|connection is not open/i.test(
      error.message,
    )
  ) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is not ready yet; retry in a moment',
      isOperational: true,
    };
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'The request body is not valid JSON',
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong while handling the request',
    isOperational: false,
  };
}

/** Terminal middleware for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

/**
 * Single exit point for every error raised in a route, controller or service.
 * Operational errors keep their message; unexpected ones are masked in production.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalised = normaliseError(error);

  const log = normalised.isOperational ? logger.warn.bind(logger) : logger.error.bind(logger);
  log('Request failed', {
    method: req.method,
    path: req.originalUrl,
    status: normalised.statusCode,
    code: normalised.code,
    error: error instanceof Error ? error : String(error),
  });

  const payload = {
    success: false as const,
    error: {
      code: normalised.code,
      message: normalised.message,
      ...(normalised.details === undefined ? {} : { details: normalised.details }),
      ...(!isProduction() && !normalised.isOperational && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  };

  if (res.headersSent) return;
  res.status(normalised.statusCode).json(payload);
};
