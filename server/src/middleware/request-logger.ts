import type { RequestHandler } from 'express';
import { isTest } from '../config/constants.js';
import { logger } from '../lib/logger.js';

/** Logs method, path, status and duration once each response completes. */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (isTest()) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info('HTTP request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
};
