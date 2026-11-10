import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards rejected promises to the centralised error handler.
 * Express 5 handles this natively, but wrapping keeps the behaviour explicit and
 * identical if the handler is mounted on a router with a different setup.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
