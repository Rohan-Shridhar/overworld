import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { API_PREFIX, isAllowedOrigin, isServerlessRuntime } from '../src/config/constants.js';

const app = createApp();

describe('deployment origin policy', () => {
  it('allows requests that carry no origin', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it('keeps localhost available for development', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it("allows the project's own Vercel deployments, including previews", () => {
    expect(isAllowedOrigin('https://overworld.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://overworld-git-main-rohan.vercel.app')).toBe(true);
  });

  it('rejects unrelated and malformed origins', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
    expect(isAllowedOrigin('not-a-url')).toBe(false);
    expect(isAllowedOrigin('ftp://overworld.vercel.app')).toBe(false);
  });

  it('detects the serverless runtime without a dedicated variable', () => {
    const previous = process.env.VERCEL;

    process.env.VERCEL = '1';
    expect(isServerlessRuntime()).toBe(true);

    delete process.env.VERCEL;
    expect(isServerlessRuntime()).toBe(false);

    if (previous !== undefined) process.env.VERCEL = previous;
  });
});

describe('nested API routing', () => {
  it('serves the API index under the /api prefix', async () => {
    const response = await request(app).get(API_PREFIX);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.endpoints)).toBe(true);
    expect(response.body.data.endpoints.length).toBeGreaterThan(5);
  });

  it('mounts the simulation router that previously had no route', async () => {
    const response = await request(app).get(`${API_PREFIX}`);

    const paths = (response.body.data.endpoints as Array<{ path: string }>).map((entry) => entry.path);

    expect(paths).toContain(`${API_PREFIX}/simulation`);
    expect(paths).toContain(`${API_PREFIX}/simulation/advance`);
  });

  it('answers deep unmatched paths with a JSON 404 instead of the SPA shell', async () => {
    const response = await request(app).get(`${API_PREFIX}/simulation/no/such/route`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body.success).toBe(false);
    expect(response.text).not.toContain('<div id="root">');
  });

  it('validates the advance body before any database work', async () => {
    const response = await request(app)
      .post(`${API_PREFIX}/simulation/advance`)
      .send({ maxDays: 99 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('rejects an invalid simulation settings patch', async () => {
    const response = await request(app).patch(`${API_PREFIX}/simulation`).send({ speed: 7 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('still serves health when the database was never connected', async () => {
    const response = await request(app).get(`${API_PREFIX}/health`);

    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBe(response.status === 200);
    expect(response.body.data.database).toHaveProperty('status');
  });
});
