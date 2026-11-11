import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mongoose is replaced entirely: these tests describe the connection lifecycle a
 * warm Vercel function relies on, not driver behaviour.
 */
const { connection, connect } = vi.hoisted(() => {
  const state = { readyState: 0, name: null as string | null, host: null as string | null };
  const connectMock = vi.fn(async () => {
    state.readyState = 1;
    state.name = 'test';
    return {};
  });

  return { connection: { state, on: () => undefined, listeners: 0 }, connect: connectMock };
});

vi.mock('mongoose', () => ({
  default: {
    connection: {
      get readyState() {
        return connection.state.readyState;
      },
      get name() {
        return connection.state.name;
      },
      get host() {
        return connection.state.host;
      },
      on: () => undefined,
    },
    connect,
    set: () => undefined,
    disconnect: async () => undefined,
  },
}));

const { ensureDatabaseConnection, getDatabaseSnapshot, resetDatabaseConnectionState } = await import(
  '../src/config/database.js'
);
const { resetEnvCache } = await import('../src/config/env.js');

const URI = 'mongodb+srv://user:pass@cluster.example.net/';

describe('serverless database connection', () => {
  beforeEach(() => {
    connection.state.readyState = 0;
    connection.state.name = null;
    connect.mockClear();
    resetDatabaseConnectionState();
  });

  it('reuses an established connection instead of reconnecting', async () => {
    connection.state.readyState = 1;

    await expect(ensureDatabaseConnection(URI)).resolves.toBe(true);
    await expect(ensureDatabaseConnection(URI)).resolves.toBe(true);

    expect(connect).not.toHaveBeenCalled();
  });

  it('shares one attempt between concurrent cold-start requests', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    connect.mockImplementationOnce(async () => {
      await gate;
      connection.state.readyState = 1;
      return {};
    });

    const first = ensureDatabaseConnection(URI);
    const second = ensureDatabaseConnection(URI);

    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('retries on a later request after a failed attempt', async () => {
    connect.mockRejectedValueOnce(new Error('Atlas unreachable'));

    await expect(ensureDatabaseConnection(URI)).resolves.toBe(false);
    expect(connect).toHaveBeenCalledTimes(1);

    await expect(ensureDatabaseConnection(URI)).resolves.toBe(true);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('never opens a connection when MONGODB_URI is absent', async () => {
    const previous = process.env.MONGODB_URI;

    delete process.env.MONGODB_URI;
    resetEnvCache();

    try {
      await expect(ensureDatabaseConnection(undefined)).resolves.toBe(false);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      if (previous !== undefined) process.env.MONGODB_URI = previous;
      resetEnvCache();
    }
  });

  it('preserves the existing connection status reporting', () => {
    connection.state.readyState = 1;

    const snapshot = getDatabaseSnapshot();

    expect(snapshot.status).toBe('connected');
    expect(snapshot.readyState).toBe(1);
  });
});
