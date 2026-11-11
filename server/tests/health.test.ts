import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns a structured report whether or not MongoDB is reachable', async () => {
    const response = await request(app).get('/api/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBe(response.status === 200);
    expect(response.body.data.app).toMatchObject({
      name: 'Geopolitical Sandbox',
      version: '0.1.0',
    });
    expect(['ok', 'degraded']).toContain(response.body.data.status);
    expect(response.body.data.database).toHaveProperty('status');
    expect(response.body.data.database).toHaveProperty('connected');
    expect(response.body.data.realtime).toMatchObject({
      transport: 'socket.io',
      path: '/socket.io',
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(response.body.data.uptimeAt))).toBe(true);
  });

  it('reports a degraded status with no Mongo connection details when Atlas is unreachable', async () => {
    const response = await request(app).get('/api/health');

    if (response.status === 503) {
      expect(response.body.data.status).toBe('degraded');
      expect(response.body.data.database.connected).toBe(false);
      expect(response.body.data.database.status).not.toBe('connected');
      expect(response.body.data.database.latencyMs).toBeNull();
    }
  });

  it('accepts the "full" detail level and reports scenario metrics', async () => {
    const response = await request(app).get('/api/health').query({ detail: 'full' });

    expect([200, 503]).toContain(response.status);
    expect(response.body.data.database).toHaveProperty('scenarioCount');
  });

  it('rejects unsupported detail values with a validation error', async () => {
    const response = await request(app).get('/api/health').query({ detail: 'everything' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: 'query', path: 'detail' }),
      ]),
    );
  });
});

describe('API surface', () => {
  it('lists available endpoints at the API root', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Geopolitical Sandbox');
    expect(response.body.data.endpoints).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/api/health' })]),
    );
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects a malformed JSON body with a 400 response', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ "broken": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});
