# camillia-monitor-analyzer

Read-only React dashboard for the Camillia Meshtastic monitor network. It derives
network activity, RF health, sender, payload, location, and MQTT analytics from
the existing ingestor API.

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
