export type ErrorDetails = Record<string, unknown> | unknown[] | undefined;

/**
 * An error that is safe to surface to API consumers: it carries the HTTP status,
 * a stable machine-readable code, and optional field-level details.
 */
export class AppError extends Error {
  readonly statusCode: number;

  readonly code: string;

  readonly details: ErrorDetails;

  readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static notFound(message = 'The requested resource does not exist'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static badRequest(message: string, details?: ErrorDetails): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details?: ErrorDetails): AppError {
    return new AppError(400, 'VALIDATION_ERROR', 'Request payload failed validation', details);
  }

  static serviceUnavailable(message: string, details?: ErrorDetails): AppError {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}
