import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { shutdown } from '../src/config/shutdown.js';
import { createSocketServer, getSocketServer } from '../src/config/socket.js';

describe('graceful shutdown', () => {
  it('closes the websocket server, the HTTP server and the database, then exits 0', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    createSocketServer(server);
    expect(getSocketServer()).not.toBeNull();

    const exit = vi.fn();

    await shutdown({ httpServer: server, signal: 'SIGTERM', exit, timeoutMs: 5000 });

    expect(getSocketServer()).toBeNull();
    expect(server.listening).toBe(false);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits 0 when no websocket server was ever created', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const exit = vi.fn();

    await shutdown({ httpServer: server, signal: 'SIGINT', exit, timeoutMs: 5000 });

    expect(server.listening).toBe(false);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
