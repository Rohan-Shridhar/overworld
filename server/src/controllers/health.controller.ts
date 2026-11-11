import type { Request, Response } from 'express';
import { getValidatedQuery } from '../middleware/validate-request.js';
import type { HealthQuery } from '../schemas/health.schema.js';
import { buildHealthReport } from '../services/health.service.js';

/**
 * `GET /api/health`
 *
 * Returns 200 when the API can reach MongoDB and 503 when it cannot, so uptime
 * monitors can act on the status code alone.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const query = getValidatedQuery<Partial<HealthQuery>>(res);
  const detail = query?.detail ?? 'summary';

  const report = await buildHealthReport(detail);

  res.status(report.status === 'ok' ? 200 : 503).json({
    success: report.status === 'ok',
    data: report,
  });
}
