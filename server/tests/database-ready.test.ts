import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sanitiseMongoMessage } from '../src/config/database.js';

/**
 * The request lifecycle under a serverless runtime: connect or reuse, verify,
 * then route. These tests drive the gate directly through `createApp` so the
 * behaviour is checked without Atlas.
 */
describe('database readiness gate', () => {
  it('refuses a database-backed route with a controlled 503 when the connection fails', async () => {
    const ensureDatabase = vi.fn(async () => false);
    const app = createApp({ requireDatabase: true, ensureDatabase });

    const response = await request(app).get('/api/world');

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body.error.details).toHaveProperty('readyState');
    expect(ensureDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not run the route handler while the database is unavailable', async () => {
    const app = createApp({ requireDatabase: true, ensureDatabase: async () => false });

    const response = await request(app).get('/api/world');

    // A routed handler would either return world data or a different error code.
    expect(response.body.data).toBeUndefined();
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('serves a route once the connection is established', async () => {
    const ensureDatabase = vi.fn(async () => true);
    const app = createApp({ requireDatabase: true, ensureDatabase });

    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(ensureDatabase).toHaveBeenCalledTimes(1);
  });

  it('retries on every request instead of caching a failure', async () => {
    const ensureDatabase = vi.fn(async () => false);
    const app = createApp({ requireDatabase: true, ensureDatabase });

    await request(app).get('/api/world');
    await request(app).get('/api/world');

    expect(ensureDatabase).toHaveBeenCalledTimes(2);
  });

  it('never fails the health probe because of the gate', async () => {
    const ensureDatabase = vi.fn(async () => false);
    const app = createApp({ requireDatabase: true, ensureDatabase });

    const response = await request(app).get('/api/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body.data).toHaveProperty('database');
    // Health reports on the database; it must not wait for a connection to do so.
    expect(ensureDatabase).not.toHaveBeenCalled();
  });

  it('survives a connector that throws', async () => {
    const app = createApp({
      requireDatabase: true,
      ensureDatabase: async () => {
        throw new Error('driver exploded');
      },
    });

    const response = await request(app).get('/api/world');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('leaves test and tooling apps ungated by default', async () => {
    const response = await request(createApp()).get('/api');

    expect(response.status).toBe(200);
  });
});

describe('credential hygiene', () => {
  it('strips connection strings from driver messages', () => {
    const message =
      'Could not connect to mongodb+srv://sim:sup3rsecret@cluster0.abcd.mongodb.net/?retryWrites=true';

    const sanitised = sanitiseMongoMessage(message);

    expect(sanitised).not.toContain('sup3rsecret');
    expect(sanitised).not.toContain('cluster0.abcd.mongodb.net');
    expect(sanitised).toContain('mongodb://***');
  });

  it('leaves messages without credentials untouched', () => {
    expect(sanitiseMongoMessage('server selection timed out after 5000 ms')).toBe(
      'server selection timed out after 5000 ms',
    );
  });
});
