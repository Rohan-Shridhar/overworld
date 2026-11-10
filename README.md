# Geopolitical Sandbox

A platform for modelling statecraft decisions: policy levers in, consequences out, against a
persistent world state.

This repository contains the **foundation release**. There is no simulation engine yet. What exists
is the platform underneath one: an HTTP API, MongoDB Atlas persistence through Mongoose, a Socket.IO
realtime channel, a React client with a live system-status page, and the lint, test and build
tooling that keeps both halves honest.

| Layer | Stack |
| --- | --- |
| Client | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, Zustand, TanStack Query, Lucide React |
| Server | Node.js, Express.js, TypeScript, MongoDB Atlas, Mongoose, Socket.IO, Zod |
| Testing | Vitest, Supertest, React Testing Library |
| Workspace | npm workspaces, ESLint, Prettier |

## Requirements

- Node.js **20.19** or newer (developed on Node 24)
- npm **10** or newer
- A MongoDB Atlas cluster with a database user and network access for your machine

## Quick start

```bash
# 1. Install every workspace dependency
npm install

# 2. Create the local server configuration
#    Copy server/.env.example to server/.env, then set MONGODB_URI
```

```bash
# 3. Start the API on :5000 and the client on :5173 together
npm run dev
```

Open <http://localhost:5173>. The page's architecture sheet reads the live health endpoint, so it
shows whether the API, MongoDB and the websocket channel are actually up.

## Environment variables

The **only** application environment variable is `MONGODB_URI`.

| Variable | File | Required | Purpose |
| --- | --- | --- | --- |
| `MONGODB_URI` | `server/.env` | Yes for database features | MongoDB Atlas connection string |

Everything else is a documented constant in source:

- API port, socket path and allowed dev origins: [`server/src/config/constants.ts`](./server/src/config/constants.ts)
- Browser-side API address and poll interval: [`client/src/config/app.config.ts`](./client/src/config/app.config.ts)
- Dev server addresses shared with the Vite proxy: [`client/src/config/dev-server.config.ts`](./client/src/config/dev-server.config.ts)

`server/.env` is git-ignored. `server/.env.example` is committed and contains only `MONGODB_URI`.

If `MONGODB_URI` is missing or the cluster is unreachable, the API still boots: it logs the reason,
`GET /api/health` returns `503` with `status: "degraded"`, and database-backed work stays disabled.
Fix the URI and restart.

## Project structure

```
/
├── client/                     React client (Vite)
│   ├── public/                 Static assets (mark.svg)
│   ├── src/
│   │   ├── api/                Endpoint wrappers and query keys
│   │   ├── app/                Providers, router
│   │   ├── components/
│   │   │   ├── architecture/   Live system diagram, node, health disclosure
│   │   │   ├── common/         Status dot, command block, mark, headings
│   │   │   ├── landing/        Page sections
│   │   │   ├── layout/         Header, footer, page shell
│   │   │   ├── motion/         Scroll reveal
│   │   │   └── ui/             shadcn/ui primitives
│   │   ├── config/             Source-controlled app + dev server configuration
│   │   ├── hooks/              Health, socket, reveal and uptime hooks
│   │   ├── lib/                API client, query client, socket, formatting
│   │   ├── routes/             Landing, not-found, error pages
│   │   ├── store/              Zustand UI store
│   │   ├── test/               Vitest setup and render helpers
│   │   └── types/              Health contract types
│   └── vite.config.ts          React + Tailwind plugins, /api and /socket.io proxy, Vitest config
├── server/                     Express API
│   ├── src/
│   │   ├── config/             Constants, env validation, database, socket
│   │   ├── controllers/        Request handlers
│   │   ├── lib/                Logger
│   │   ├── middleware/         Validation, error handling, request logging
│   │   ├── models/             Mongoose models
│   │   ├── routes/             Feature routers
│   │   ├── schemas/            Zod request schemas
│   │   ├── services/           Business logic
│   │   ├── utils/              AppError, async handler
│   │   ├── app.ts              Express app factory (used by Supertest)
│   │   └── server.ts           Listener, Socket.IO, database, graceful shutdown
│   ├── tests/                  Vitest + Supertest suites
│   ├── .env.example            MONGODB_URI only
│   └── tsconfig*.json
└── package.json                Workspaces and root scripts
```

## Root scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the API and the client together (concurrently) |
| `npm run dev:client` / `npm run dev:server` | Each half on its own |
| `npm run build` | Type-checks and builds the server (`dist/`) then the client (`client/dist/`) |
| `npm start` | Runs the built API from `server/dist` |
| `npm run lint` | ESLint across both workspaces |
| `npm run typecheck` | TypeScript across both workspaces |
| `npm run test` | Vitest suites in both workspaces |
| `npm run format` / `npm run format:check` | Prettier |

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api` | Service name, version and the endpoint index |
| `GET` | `/api/health` | `200` when MongoDB is reachable, `503` when it is not |

`GET /api/health?detail=full` additionally probes the database (ping plus a bounded scenario count)
and returns:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "app": { "name": "Geopolitical Sandbox", "version": "0.1.0", "environment": "development" },
    "uptimeSeconds": 42,
    "database": { "status": "connected", "connected": true, "latencyMs": 18, "scenarioCount": 0 },
    "realtime": { "transport": "socket.io", "path": "/socket.io", "connectedClients": 1 },
    "checkedAt": "2026-11-10T17:10:00.000Z"
  }
}
```

An unsupported `detail` value returns `400` with `error.code: "VALIDATION_ERROR"`. Every error
response uses the same envelope: `{ success: false, error: { code, message, details? } }`.

## Development routing

The browser only ever talks to the Vite dev server:

- `/api` → proxied to `http://localhost:5000`
- `/socket.io` → proxied to `http://localhost:5000`, including the websocket upgrade

Both paths are defined once in [`client/src/config/app.config.ts`](./client/src/config/app.config.ts)
and reused by `vite.config.ts`, so the frontend API address lives in normal source control rather
than an environment file.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Deliberate exclusions

No Docker, no Redis, no PostgreSQL, no external auth provider, no AI APIs and no microservices. The
client and the API are the two packages in this workspace.

## Licence

Apache License 2.0 — see [`LICENSE`](./LICENSE).
