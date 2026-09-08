# camillia-monitor-analyzer

Read-only React dashboard for the Camillia Meshtastic monitor network. It derives
network activity, RF health, sender, payload, location, and MQTT analytics from
the existing ingestor API, with time-window and modem-preset filtering.

## Run locally

Start the ingestor first (it listens on port 3000 by default):

```bash
cd ../camillia-monitor-ingestor
npm install
npm run start:dev
```

Then start the analyzer:

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to
`http://localhost:3000`, so the ingestor does not need local CORS changes.

## Configuration

Copy `.env.example` to `.env.local` only when the defaults need changing.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Browser-facing base path for ingestor requests |
| `VITE_DEV_API_PROXY` | `http://localhost:3000` | Development proxy target |

For production, serve the built app and reverse proxy `/api` to the ingestor.
An absolute `VITE_API_BASE_URL` also works when the ingestor explicitly allows
that browser origin.

## Container deployment

The production image builds the React application and serves it from an
unprivileged Nginx process. Nginx proxies `/api` directly to the
`camillia-monitor-ingestor` container over its existing Docker network and
rejects non-read API methods.

```bash
docker compose up -d --build
curl http://localhost:3001/healthz
```

The analyzer listens on host port `3001` by default. Set `ANALYZER_PORT` when a
different published port is needed. The container filesystem is read-only apart
from an in-memory `/tmp` mount. The
`camillia-monitor-ingestor_default` network and ingestor container must already
exist before the analyzer starts.

## Data access

The analyzer only sends `GET` requests. It reads status, nodes, messages,
message totals, MQTT topic captures, and channel summaries. Collection snapshots
are capped at the API maximum of 1,000 records; stored totals still come from
the dedicated count and summary endpoints.

## Commands

```bash
npm run dev      # development server
npm run build    # TypeScript check and production bundle
npm run lint     # Oxlint
npm run preview  # preview the production build
```
