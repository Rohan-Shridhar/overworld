# Geopolitical Sandbox

A platform for modelling statecraft decisions: policy levers in, consequences out, against a
persistent world state.

This repository contains the **foundation release**. There is no simulation engine yet. What exists
is the platform underneath one: an HTTP API, MongoDB Atlas persistence through Mongoose, a Socket.IO
realtime channel, a React client with a live system-status page, and the lint, test and build
tooling that keeps both halves honest.

| Layer | Stack |
| --- | --- |
| Client | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, Zustand, TanStack Query, Lucide React, MapLibre GL JS |
| Server | Node.js, Express.js, TypeScript, MongoDB Atlas, Mongoose, Socket.IO, Zod, d3-delaunay, polygon-clipping |
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
│   │   │   ├── world/          Map, top bar, directory, dossier, forms, legend, events
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
| `GET` | `/api/world` | World metadata plus all countries as a GeoJSON `FeatureCollection` |
| `GET` | `/api/world/provinces` | Province boundaries; optional `?countryId=` scopes it to one state |
| `GET` | `/api/world/countries/:code` | One country profile (all seven dossier tabs) plus its provinces |
| `POST` | `/api/world/countries` | Creates a state and claims unoccupied territory in a continent |
| `PATCH` | `/api/world/countries/:code` | Updates country statistics and appends an administration entry to its history |
| `DELETE` | `/api/world/countries/:code` | Removes a state and its provinces; the last state cannot be deleted |
| `POST` | `/api/world/countries/:code/provinces` | Adds a province inside that country and recalculates its area |
| `PATCH` | `/api/world/provinces/:id` | Updates a province's name, population, terrain, resources or infrastructure |
| `POST` | `/api/world/provinces/:id/transfer` | Administrative transfer of a province to another state |

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

## World atlas

`/world` is the primary interface: a MapLibre GL map filling the viewport with a map-mode rail, a
searchable state list, a country dossier and a world-event panel. Every border, name, capital and
leader is fictional.

The world is generated, not authored:

- Six continents are placed on a fictional lon/lat plane as irregular rings.
- Country seeds are sampled inside each continent and turned into Voronoi cells, clipped to the
  continent boundary by `polygon-clipping` (MIT). Cells tile the land exactly, so there are no gaps
  or overlaps.
- Provinces repeat the same process inside each country, three to five per state.
- All randomness comes from a `mulberry32` generator seeded by `DEFAULT_WORLD_SEED`
  (`server/src/world/world.constants.ts`), so the same seed always produces the same world.
- The generated world is persisted once. `ensureDefaultWorld()` memoises the in-flight bootstrap and
  the unique `worlds.slug` index rejects a second insert, so refreshes and parallel requests reuse
  the existing world instead of regenerating or duplicating it.
- `backfillCountryProfiles()` runs once per boot and tops up worlds written before a field existed:
  missing economy, military, diplomacy, government, description and history records are generated
  deterministically, and province areas are measured from their stored geometry. Records that are
  already present, including administrator edits, are never overwritten.

Map modes: **Political** is fully implemented (each state painted in its own colour). Diplomatic,
Military, Economic, Resources and Territorial Control ship with their legend and an explicit
"data arrives with the simulation engine" note.

### Country dossier

Selecting a state on the map, or picking it from the directory, opens the right-hand dossier:

| Tab | Contents |
| --- | --- |
| Overview | Capital, continent, population, GDP, government, leader, diplomatic status, provinces, stability |
| Economy | GDP growth, inflation, debt, currency, trade balance, production by resource |
| Military | Personnel by branch, equipment counts, installations, deployments |
| Diplomacy | Status, alliances, treaties, rivals, sanctions, trade partners |
| Government | Type, leader, ideology, ruling party, stability, next election |
| Territory | Derived area, province list, population share, resource spread |
| History | Country events, newest first |

Every field is stored state read from MongoDB; the client only formats values and aggregates the
province figures shown in Territory.

The directory panel above it carries a search field, continent filters and three sort orders
(name, population, GDP), so a state can be reached without hunting for its shape on the map.

### Administrative editing (God Mode)

The shield control in the top bar toggles God Mode, which reveals the administrative actions:

- **Create country** — validates name, code, capital, colour, population, GDP, government, leader
  and stability, then places the state in unoccupied space inside the chosen continent and derives
  its area from the claimed geometry.
- **Edit country** — the whole profile, economy and military figures included; every save appends an
  administration entry to the country history.
- **Delete country** — deletes the state and its provinces, but refuses to remove the last state.
- **Province management** — add or edit provinces, and transfer one to another state. Ownership,
  controller and the area of both affected countries move together, and both histories record it.

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

## Deploying to Vercel (Hobby)

### Architecture on Vercel

| Concern | Local development | Vercel |
| --- | --- | --- |
| Frontend | Vite dev server on `:5173` | Static assets from `kalori/dist` |
| API | Express listener on `:5000` | One Node.js Function at `api/index.js` |
| Routing | Vite proxy forwards `/api` | Rewrite sends `/api/*` to the function; every other path falls back to `index.html` |
| Simulation clock | Timer engine (`setInterval`-style scheduler) | Request-driven advancement over MongoDB |
| Realtime | Socket.IO on the same HTTP server | HTTP polling (see below) |

`api/index.js` imports the compiled `server/dist/app.js` and reuses `createApp()`, so
middleware, validation, Helmet headers, request logging and the error envelope are
identical in both environments. The function never calls `listen()`.

### Why the entry point imports `server/dist`

The server source uses NodeNext `.js` specifiers (`./app.js` for `app.ts`). Vercel's
bundler does not rewrite those to the TypeScript sources, so the function targets the
compiled output instead. `vercel.json` runs `npm run build` before functions are
bundled, which produces `server/dist` and `kalori/dist`.

### Simulation progression

MongoDB is the only authoritative clock. A world stores `currentSimulationDate`,
`simulationSettings`, `simulationState.lastTickAt`, the tick ledger and periodic
checkpoints.

- `GET /api/simulation` returns the persisted snapshot. It never simulates.
- `POST /api/simulation/advance` commits due days. It is idempotent per day: the
  unique `(worldId, day)` index means a claim either wins or sees `duplicate`, so two
  concurrent function instances cannot apply the same day twice.
- Each call commits at most `SERVERLESS_MAX_DAYS_PER_REQUEST` (12) days inside a
  6.5 s budget, and reports `advancedDays` and `remainingDays`.
- **Nothing is dropped.** `simulationState.lastTickAt` advances by exactly the days
  committed, never to "now", so a backlog that outlives one invocation is still
  overdue when the next request arrives.
- Pausing writes `lastTickAt = now`, so no backlog accrues while a world is stopped.
- Deterministic seeds are unchanged (`sim:<worldId>:<day>:<country>`), so the same
  world and day always produce the same outcome on any instance.
- Scheduled actions, diplomacy maintenance and stability reviews run inside the same
  day loop as the local engine.

### Realtime fallback

Socket.IO needs a process that outlives a request and a bus that is shared by every
instance. Vercel gives neither for free (no Redis, no paid add-ons here). Therefore:

- Socket.IO is created **only when the process is not serverless**, so local
  development keeps working unchanged.
- Production relies on HTTP polling: the frontend calls `/api/simulation` every 5
  seconds, never with overlapping requests, pauses while the tab is hidden and clears
  its interval on unmount.
- Broadcasts are treated as an optimisation, never as the source of truth.

### Vercel dashboard settings

| Setting | Value |
| --- | --- |
| Framework preset | Other (detected automatically; `vercel.json` overrides build settings) |
| Root directory | Repository root (`./`) |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `kalori/dist` |
| Node.js version | 20.x or 22.x |
| Function region | Closest to the Atlas cluster |

### Adding `MONGODB_URI`

1. Vercel → project → **Settings → Environment Variables**.
2. Key: `MONGODB_URI`. Value: the Atlas connection string, including the database
   name (for example `...mongodb.net/overworld?retryWrites=true&w=majority`).
3. Apply to **Production**, **Preview** and **Development**.
4. Do not add any other variable. Nothing else is read.
5. Redeploy so the value reaches the function runtime.

If the URI has no database path, Mongoose writes to the default `test` database.

### Deploying from GitHub `main`

1. Push the repository to GitHub.
2. Vercel → **Add New → Project → Import Git Repository**.
3. Leave the root directory at the repository root; let `vercel.json` drive the build.
4. Add `MONGODB_URI` before the first deployment.
5. In Atlas, allow Vercel egress: add `0.0.0.0/0` (simplest for Hobby) or Atlas's
   Vercel integration.
6. Deploy. Every later push to `main` deploys production; other branches and pull
   requests deploy previews.
7. Smoke test: `/api/health` (JSON, `data.database.status`), `/api/world`,
   `/api/simulation`, then `POST /api/simulation/advance` with `{}`.

### Known Hobby limitations

- **Function duration** is 10 s, so an overdue backlog is committed in batches. The
  response tells you how much remains.
- **No shared Socket.IO bus**, so no server-push updates across instances. Polling is
  the production mechanism.
- **Cold starts** open a new Atlas connection. Concurrent requests on the same
  instance share one in-flight attempt, and a warm instance reuses its pool.
- **No cron substitute**: progression is only driven by requests. An idle world
  pauses until someone calls the API again.
- The API is unauthenticated. Anyone who can reach the URL can mutate the world.

### Deployment checklist

- [ ] `MONGODB_URI` set for Production, Preview and Development — and nothing else
- [ ] Atlas cluster reachable from Vercel (network access entry)
- [ ] `npm run build` succeeds locally
- [ ] `server/dist/app.js` and `kalori/dist/index.html` are produced
- [ ] `/api/health` returns `200` with `database.connected: true`
- [ ] `/api/world` returns countries
- [ ] `/api/simulation` returns a clock
- [ ] `POST /api/simulation/advance` returns `advancedDays`
- [ ] Refresh the page: the status bar shows a running clock, or a clear error
- [ ] `/.env` is not committed

## Deliberate exclusions

No Docker, no Redis, no PostgreSQL, no external auth provider, no AI APIs and no microservices. The
client and the API are the two packages in this workspace.

## Licence

Apache License 2.0 — see [`LICENSE`](./LICENSE).
