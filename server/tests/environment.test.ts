import { describe, expect, it } from 'vitest';
import { EnvValidationError, envSchema, parseEnv } from '../src/config/env.js';
import { getDatabaseSnapshot } from '../src/config/database.js';

const ATLAS_URI =
  'mongodb+srv://user:secret@cluster0.abcd123.mongodb.net/geopolitical-sandbox?retryWrites=true&w=majority';

describe('environment validation', () => {
  it('accepts a MongoDB Atlas SRV connection string', () => {
    expect(parseEnv({ MONGODB_URI: ATLAS_URI })).toEqual({ MONGODB_URI: ATLAS_URI });
  });

  it('accepts a standard mongodb:// connection string', () => {
    expect(parseEnv({ MONGODB_URI: 'mongodb://localhost:27017/sandbox' }).MONGODB_URI).toBe(
      'mongodb://localhost:27017/sandbox',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(parseEnv({ MONGODB_URI: `  ${ATLAS_URI}  ` }).MONGODB_URI).toBe(ATLAS_URI);
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });

  it('rejects connection strings that are not MongoDB URIs', () => {
    expect(() => parseEnv({ MONGODB_URI: 'postgres://localhost:5432/sandbox' })).toThrow(
      /MONGODB_URI must be a mongodb:\/\/ or mongodb\+srv:\/\//,
    );
  });

  it('ignores every environment variable except MONGODB_URI', () => {
    const parsed = parseEnv({
      MONGODB_URI: ATLAS_URI,
      PORT: '9999',
      JWT_SECRET: 'should-not-be-read',
    } as unknown as Record<string, string>);

    expect(Object.keys(parsed)).toEqual(['MONGODB_URI']);
  });

  it('exposes a schema whose only key is MONGODB_URI', () => {
    expect(Object.keys(envSchema.shape)).toEqual(['MONGODB_URI']);
  });
});

describe('database snapshot', () => {
  it('reports a disconnected state before any connection attempt', () => {
    const snapshot = getDatabaseSnapshot();

    expect(snapshot).toHaveProperty('readyState');
    expect(['connected', 'connecting', 'disconnecting', 'disconnected']).toContain(snapshot.status);
  });
});
