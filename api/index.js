/**
 * Vercel Node.js Function entry point.
 *
 * Vercel routes every `/api/*` request here (see `vercel.json`). The function
 * does not start a listener and does not own any state: it delegates to the same
 * Express application the local development server uses, so middleware,
 * validation, security headers, logging and error handling are identical.
 *
 * It imports the compiled output (`server/dist`) because the server source uses
 * NodeNext `.js` specifiers that Vercel's bundler would not resolve against
 * `.ts` files. `buildCommand` compiles the server before functions are bundled.
 */
import { createApp } from '../server/dist/app.js';
import { ensureDatabaseConnection } from '../server/dist/config/database.js';

const app = createApp();

/**
 * Vercel normally forwards the original request path, but when a rewrite
 * targets a function the path can arrive already collapsed. Restoring the
 * `/api` prefix here makes routing independent of that detail.
 */
function normaliseUrl(request) {
  const url = request.url ?? '/';

  if (url.startsWith('/api')) return;

  request.url = url === '/' ? '/api' : `/api${url}`;
}

export default async function handler(request, response) {
  normaliseUrl(request);

  // Never fatal: /api/health must still answer while Atlas is unreachable.
  try {
    await ensureDatabaseConnection();
  } catch (error) {
    console.error('Database connection attempt failed', error);
  }

  return app(request, response);
}
