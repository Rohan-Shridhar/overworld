import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { logger } from '../lib/logger.js';
import {
  ALLOWED_ORIGINS,
  API_PREFIX,
  APP_VERSION,
  SOCKET_PATH,
  SOCKET_PING_INTERVAL_MS,
  SOCKET_PING_TIMEOUT_MS,
} from './constants.js';

/** Event names shared with the client. */
export const SOCKET_EVENTS = {
  SYSTEM_HELLO: 'system:hello',
  SIMULATION_STATE: 'simulation:state',
  SIMULATION_TICK: 'simulation:tick',
  SIMULATION_EVENT: 'simulation:event',
} as const;

export interface SystemHelloPayload {
  socketId: string;
  serverTime: string;
  version: string;
}

let socketServer: SocketServer | null = null;

export function createSocketServer(httpServer: HttpServer): SocketServer {
  if (socketServer) return socketServer;

  socketServer = new SocketServer(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    cors: { origin: [...ALLOWED_ORIGINS], methods: ['GET', 'POST'] },
    pingInterval: SOCKET_PING_INTERVAL_MS,
    pingTimeout: SOCKET_PING_TIMEOUT_MS,
  });

  socketServer.on('connection', (socket) => {
    const payload: SystemHelloPayload = {
      socketId: socket.id,
      serverTime: new Date().toISOString(),
      version: APP_VERSION,
    };

    socket.emit(SOCKET_EVENTS.SYSTEM_HELLO, payload);
    logger.info('Realtime client connected', { socketId: socket.id });

    socket.on('disconnect', (reason) => {
      logger.debug('Realtime client disconnected', { socketId: socket.id, reason });
    });
  });

  logger.info('Socket.IO initialised', { path: SOCKET_PATH, api: API_PREFIX });
  return socketServer;
}

export function getSocketServer(): SocketServer | null {
  return socketServer;
}

export function getSocketClientCount(): number {
  return socketServer?.engine.clientsCount ?? 0;
}

/** Closes the websocket server (and every open connection) during shutdown. */
export async function closeSocketServer(): Promise<void> {
  if (!socketServer) return;

  await new Promise<void>((resolve) => {
    socketServer?.close(() => resolve());
  });

  socketServer = null;
  logger.info('Socket.IO closed');
}
