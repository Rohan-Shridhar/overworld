import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

export type RequestPart = 'body' | 'query' | 'params';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface ValidatedRequest {
  body: unknown;
  query: unknown;
  params: unknown;
}

export interface ValidationIssue {
  location: RequestPart;
  path: string;
  message: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      validated?: ValidatedRequest;
    }
  }
}

/**
 * Validates and coerces request input against Zod schemas.
 *
 * Parsed values are written to `res.locals.validated` rather than back onto the
 * request: Express 5 exposes `req.query` as a read-only getter, so mutating it
 * would throw. Controllers read the parsed values through `getValidatedQuery`.
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const issues: ValidationIssue[] = [];
    const validated: ValidatedRequest = {
      body: req.body,
      query: req.query,
      params: req.params,
    };

    (Object.keys(schemas) as RequestPart[]).forEach((part) => {
      const schema = schemas[part];
      if (!schema) return;

      const result = schema.safeParse(req[part]);

      if (result.success) {
        validated[part] = result.data;
        return;
      }

      result.error.issues.forEach((issue) => {
        issues.push({
          location: part,
          path: issue.path.join('.') || part,
          message: issue.message,
        });
      });
    });

    if (issues.length > 0) {
      next(AppError.validation(issues));
      return;
    }

    res.locals.validated = validated;
    next();
  };
}

/** Typed accessor for values produced by `validateRequest`. */
export function getValidatedQuery<T>(res: Response): T {
  return (res.locals.validated as ValidatedRequest | undefined)?.query as T;
}

export function getValidatedBody<T>(res: Response): T {
  return (res.locals.validated as ValidatedRequest | undefined)?.body as T;
}

export function getValidatedParams<T>(res: Response): T {
  return (res.locals.validated as ValidatedRequest | undefined)?.params as T;
}
