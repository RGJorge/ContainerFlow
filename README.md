# ContainerFlow

[![CI](https://github.com/RGJorge/ContainerFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/RGJorge/ContainerFlow/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Release](https://img.shields.io/github/v/tag/RGJorge/containerflow?label=version&color=green)](https://github.com/RGJorge/containerflow/tags)
![Docker Required](https://img.shields.io/badge/Docker-required-blue?logo=docker)
![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)
[![Last Commit](https://img.shields.io/github/last-commit/RGJorge/containerflow)](https://github.com/RGJorge/containerflow/commits/main)

**Read this in other languages**: [Español](./README.es.md)

Real-time Docker architecture visualizer. Displays services, connections and metrics from all your Docker Compose projects in an interactive dashboard.

![ContainerFlow demo](docs/demo.gif)

> *"Build what docker doesn't have the vision to build, and that Railway won't bring to local, without having to become either."*
>
> — u/dashingsauce, [on the launch thread](https://www.reddit.com/r/coolgithubprojects/comments/1ta8kak/comment/olecbxl/)

## Why ContainerFlow

Existing tools show you numbers. ContainerFlow also:

- **Visualizes architecture** — interactive graph with connections (app→db, app→cache, proxy→app) auto-detected, not just a flat list
- **Detects sub-optimal config** — banners when a container runs without memory limits, CPU limits, or `restart: unless-stopped`. Teaches good practices while you use it
- **Measures real memory** — subtracts full page cache (active + inactive), not just inactive like `docker stats`. Your Postgres DB with hot buffers no longer reports a false 98%
- **Multi-tenant via path scoping** — `ALLOWED_PATHS` env var for shared servers: see everything, only touch what's yours
- **80 MB RAM, ~500ms startup** — Bun + Hono. A fraction of Portainer's footprint, starts faster than Grafana

## Quick start

No clone needed. Pull the prebuilt image from GHCR:

```bash
curl -O https://raw.githubusercontent.com/RGJorge/ContainerFlow/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/RGJorge/ContainerFlow/main/.env.example
cp .env.example .env
docker compose up -d
```

Open `http://localhost:9470`. Done.

### Build from source instead

If you cloned the repo and want to build locally (e.g. you modified the code):

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
cp .env.example .env
# In .env, uncomment: COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
docker compose up -d --build
```

For native development (hot reload, no Docker): `bun install && bun run dev`.

## Documentation

- **[docs/docker-guide.md](./docs/docker-guide.md)** — Docker quick guide for using ContainerFlow: what each action does (Start, Stop, Restart, Recreate, Rebuild, Remove, Exec), restart policies, resource limits, volumes, healthchecks and FAQs. (Currently in Spanish; English translation in progress.)
- **[docs/roadmap.md](./docs/roadmap.md)** — Project roadmap: what's done, what's coming, what was discarded and why.

## Requirements

- [Bun](https://bun.sh) >= 1.0
- Docker running with socket access (`/var/run/docker.sock`)

## Installation

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
bun install
```

## Configuration

Copy the example file and edit:

```bash
cp .env.example .env
```

Available variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9470` | Server port |
| `AUTH_TOKEN` | _(empty)_ | Auth token. Empty = no auth, localhost only. Set = auth enabled, remote access allowed |
| `DATA_DIR` | `./data` | Persistence directory: stats history (`.dockerflow-stats.db`), Discord config (`.dockerflow-discord.json`), per-container overrides (`.dockerflow-container-settings.json`), node positions and env file overrides. Auto-created on startup. In Docker, mounted at `/app/data` via the `containerflow-data` volume. |
| `HOST_PROJECTS_DIR` | _(empty)_ | Additional path to mount so `rebuild`/`remove` can read compose files outside the defaults (`/home`, `/opt`, `/srv`, `/root`). Only needed for non-standard paths (e.g. `/data/apps`). |
| `COMPOSE_SCAN_PATHS` | _(empty)_ | `:`-separated directories to scan for compose files in the Compose Library. These paths must be mounted into the ContainerFlow container at the same absolute paths. |
| `ALLOWED_PATHS` | _(empty)_ | **Empty = everything actionable** (permissive mode). With values = `:`-separated list of prefixes; only containers whose compose file lives under one of these paths can execute actions, the rest appear with a lock icon. See [Security](#security) section. |
| `ALLOW_NON_COMPOSE` | `false` | **Only applies when `ALLOWED_PATHS` is active.** If `ALLOWED_PATHS` is empty, this has no effect. When applicable: `false` blocks actions on non-compose containers (started with `docker run` directly); `true` allows them. |

## Usage

### Development (hot reload)

```bash
bun run dev
```

Opens `http://localhost:9420` (Vite dev with hot reload, proxies API to the backend on port 9470).

### Production (Docker)

```bash
docker compose up -d
```

Opens `http://localhost:9470`.

### Production (manual)

```bash
bun run build
bun run start
```

Opens `http://localhost:9470`.

### Visualization modes

```bash
# View ALL Docker containers
bun run start -- --all

# View only specific projects
bun run start -- --projects=my-project,another-project

# Auto-detect from current directory
bun run start
```

## Features

- **Automatic discovery** — detects services via Docker socket, groups by project or compose file
- **Compose Library** — scans configured stack folders and shows compose services even when no container exists yet. Start one service with `Up`, or launch the whole stack with `Up Stack`
- **Smart connections** — detects app→database, app→cache, proxy→app, worker→broker relationships
- **Real-time metrics** — CPU and memory per container, refreshed every 3 seconds
- **Docker events** — visual flash when a container starts, stops or restarts
- **Detail panel** — click a container to see info, stats, env vars and config in separate tabs
- **Container logs** — real-time logs with auto-scroll, stream filter (stdout/stderr) and copy option
- **Container actions** — start, stop, restart, rebuild, recreate and remove directly from the panel
- **Execute commands** — inline terminal (`docker exec`) from the DetailPanel with output, no SSH or external terminal needed
- **Error toasts** — when an action fails (broken rebuild, exec with non-zero exit code, etc.) a top-right toast shows the full error, copyable to clipboard
- **Path-based access control** — `ALLOWED_PATHS` env var lets you restrict actions to containers whose compose file lives under specific paths. Ideal for shared servers: see everything, only touch what's yours. Containers outside the paths appear with a lock icon
- **Docker config recommendations** — warning banners in the DetailPanel when a container has sub-optimal config: no memory limit, no CPU limit, no restart policy (`unless-stopped` recommended). Helps users adopt good Docker practices without having to remember them
- **Volumes and mounts** — DetailPanel lists each mount on the container: type (bind / volume / tmpfs), source on the host, destination in the container, rw/ro mode. Useful for debugging ("where's my data?", "is this read-only?", "is it persistent?")
- **Project filter** — dropdown to show/hide projects, persists across sessions
- **Authentication** — login screen with AUTH_TOKEN for secure remote access
- **Connection legend** — color-coded by type: Database (blue), Cache (red), Broker (orange), Proxy (green)
- **Visual groups** — boxes per project/compose with title, compose file and container count
- **Context menu** — right-click on a node for quick actions
- **Monitoring page** — CPU/RAM history per service (1h, 6h, 24h, 7d) persisted in SQLite, sparkline charts, expand per container, filters by project/service, and a Docker events feed
- **Discord notifications** — configurable webhook for state changes, resource alerts, manual actions and errors
- **Per-container thresholds** — custom CPU/MEM overrides (with fallback to global thresholds) and notification toggle per service
- **Settings page** — application configuration (auth, Discord, Docker hosts)

### Compose Library

The Compose Library is for services that exist in compose files but do not currently exist as Docker containers, for example stacks you keep down until needed.

Configure one or more scan roots:

```bash
COMPOSE_SCAN_PATHS=/srv/stacks:/opt/stacks
```

ContainerFlow scans those folders recursively for `compose.yml`, `compose.yaml`, `docker-compose.yml`, and `docker-compose.yaml`. In Docker deployments, the scan paths must be mounted into the ContainerFlow container at the same absolute paths so `docker compose -f <file>` can read the same files.

The library supports:

- `Up` — runs `docker compose -f <file> up -d <service>`
- `Up Stack` — runs `docker compose -f <file> up -d`
- existing env-file detection used by rebuild/recreate
- existing `ALLOWED_PATHS` restrictions

Services using Compose `profiles` are visible, but individual `Up` is disabled in this version. The first implementation targets the local Docker host only; the response model includes `host: "local"` so future multi-host routing can use the same UI and API shape.

## Best practices

ContainerFlow doesn't just monitor: it detects sub-optimal Docker configuration and flags it with an amber banner in the affected container's DetailPanel. The idea is to help you adopt good practices without having to remember them.

### Active recommendations (automatic warnings)

| Detection | Why it matters | How it shows in ContainerFlow |
|---|---|---|
| **No `memory_limit`** | A container without a RAM cap can hog all host memory and take down everything else (including the daemon). The kernel does random OOM kills under pressure. | Banner: "No memory limit configured in Docker" |
| **No `cpu_quota`** | Similar to memory — a container can saturate all cores. Critical in multi-tenant, degrades host responsiveness in single-tenant. | Banner: "No CPU limit configured in Docker" |
| **`restart: no` or empty** | If the process dies, the container stays dead. In production you almost always want `unless-stopped` (restarts on crash, does **NOT** if you stopped it manually). | Banner: "Restart policy: none — the container will not restart automatically if stopped" |

### Recommended config (template)

```yaml
# docker-compose.yml — best practices
services:
  my-app:
    image: my-app:latest
    restart: unless-stopped              # ← restarts on crash, respects manual stops
    deploy:
      resources:
        limits:
          cpus: "0.5"                    # ← maximum half a core
          memory: 256M                   # ← absolute cap, prevents host OOM
    healthcheck:                         # ← detects "alive but broken" apps
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

### Why ContainerFlow does this

Most Docker tutorials don't mention these settings because "it works without them". But in production they're the difference between:

- **No limits**: a memory leak in one service takes down the ENTIRE server
- **With limits**: the container kills itself, the rest stays alive, restart policies revive it

ContainerFlow reminds you visually each time you open the DetailPanel — not spam, just educational context where it applies.

### On the roadmap

- **Healthcheck recommendations**: detect containers without `HEALTHCHECK` and suggest a contextual one based on the image (postgres → `pg_isready`, redis → `redis-cli ping`, http app → `curl /health`, etc.)
- **Non-persistent mounts**: warning when a DB uses `tmpfs` or binds to an ephemeral directory
- **`:latest` tag**: warning when a container uses `image:latest` (not reproducible)

## Monitoring and history

ContainerFlow keeps a metrics history and notifies important events to Discord.

### Metrics history

- **Persistence** — CPU and memory stats stored in SQLite (`.dockerflow-stats.db`) on every Docker polling cycle (~3s)
- **Ranges** — `1h`, `6h`, `24h`, `7d` with aggregated buckets (30s / 60s / 5min / 30min) for performance
- **Retention** — hourly auto-cleanup drops data older than 7 days and compacts the database with `VACUUM`
- **API** —
  - `GET /api/stats/history?range=1h` — history of all services
  - `GET /api/stats/history/:uid?range=1h` — history of a specific service
- **UI** — the monitoring page (`MonitoringPage.tsx`) shows a card per service with CPU and MEM sparklines, current value, average and threshold line. Each card can be expanded for a larger chart, and filtered by project and/or service (filters are cumulative).

### Discord notifications

Configured from **Settings → Discord Notifications**. Requires a webhook URL starting with `https://discord.com/api/webhooks/`.

Supported events (each can be toggled on/off):

| Event | When it fires |
|---|---|
| **Container State Changes** | `start`, `stop`, `die` (crash), `restart`, `health_status`. `stop`/`die` events are debounced 15s to detect restarts and send a single "Container Restarted" message instead of separate stop+start |
| **Resource Alerts** | A container's CPU or memory exceeds the threshold (global or per-container) |
| **UI Actions** | Manual action triggered from the panel: start/stop/restart/rebuild/remove |
| **Action Errors** | An action executed from the UI failed (includes the error message) |

Anti-spam mechanisms:

- **Global cooldown** — minimum minutes between alerts of the same type+service (default `5 min`, configurable `1-60`)
- **Down reminder** — if a container stays down, resends a "Container Still Down" reminder every N minutes (default `5 min`)
- **Queue with rate limit** — 500ms minimum between webhooks; if Discord responds `429`, respects `Retry-After` and retries
- **Stop/die debounce** — 15s buffer to collapse restart/redeploy into a single notification

Thresholds:

- **Globals** — CPU% and MEM% in Settings (default 50% / 60%)
- **Per container** — from the monitoring page, click the ⚙️ icon on a service to open the inline panel. Allows:
  - Enable/disable notifications for that container
  - CPU threshold override (slider)
  - Memory threshold override
  - Reset to global value (X)
  - Overrides persist in `.dockerflow-container-settings.json` and auto-save with 400ms debounce

A **Test** button in Settings sends a test embed to the webhook to verify it works before enabling.

## Tests

The project uses [Vitest](https://vitest.dev/) for unit tests.

```bash
# Run all tests
bun run test

# Watch mode (re-runs on save)
bun run test:watch

# Type-check TypeScript
bun run typecheck
```

Tests cover:

- **Processing logic** (`src/client/hooks/processing.test.ts`) — state sync when actions are executed on containers (start/stop/restart), including crashed/dead states, timeouts and minDuration handling
- **Connection detection** (`src/server/docker.test.ts`) — discovery of service relationships via shared networks, service classification (infra, proxy, worker) and deduplication
- **Memory breakdown calc** (`src/server/watcher.test.ts`) — `computeMemoryBreakdown()` covering cgroup v1 and v2, fallback paths and edge cases

## CI

GitHub Actions runs automatically on every push/PR to `main`:

1. Typecheck (type errors)
2. Tests (Vitest)
3. Build (production)

See `.github/workflows/ci.yml`.

## Security

### Network and authentication

- **HTTPS required in production** — the auth token travels in HTTP headers. Without HTTPS, it's plaintext visible on the network. Use a TLS-terminating reverse proxy (nginx, Caddy, Cloudflare Tunnel) in front of ContainerFlow.
- **Rate limiting** — included by default: 5 failed attempts per minute per IP. After the limit, returns `429 Too Many Requests`. Applies to both REST API and WebSocket authentication.
- **Local access by default** — without `AUTH_TOKEN`, the server only listens on `127.0.0.1`. With `AUTH_TOKEN`, it listens on `0.0.0.0` for remote access.

### Container privileges

ContainerFlow is a privileged tool by design:

- **Docker socket** (`/var/run/docker.sock`) — full daemon access. Equivalent to root on the host: can create privileged containers, mount any path, read/write the entire filesystem. If ContainerFlow is compromised, the host is compromised.
- **Read-only host mounts** — `docker-compose.yml` mounts `/home`, `/opt`, `/srv` and `/root` as `:ro` so the `rebuild` and `exec` actions can read compose files. Allows **read access** to files in those directories (including SSH keys, git credentials, etc. of any user on the system).

**Implications on a multi-user server:** if multiple users (`/home/jorge`, `/home/israel`, `/home/pedro`) have projects on the same host, ContainerFlow can read all their files. Docker socket access makes this relatively moot (anyone with the socket already has full host access), but worth being aware of.

### Recommended setup for single-user

Current defaults — convenient and sufficient:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - containerflow-data:/app/data
  - /home:/home:ro
  - /opt:/opt:ro
  - /srv:/srv:ro
  - /root:/root:ro
```

### Recommended setup for multi-user / production

Limit mounts to specific directories where you have projects:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - containerflow-data:/app/data
  # Instead of all of /home, only your projects
  - /home/jorge/git:/home/jorge/git:ro
  - /srv/apps:/srv/apps:ro
```

This reduces blast radius if there's a bug that leaks paths.

### Recommended setup for shared deploys: `ALLOWED_PATHS`

If multiple admins share a server and each should only interact with their own containers, configure the `ALLOWED_PATHS` env var in `.env`:

```bash
# .env
ALLOWED_PATHS=/home/jorge:/srv/myapp    # paths separated by ":"
ALLOW_NON_COMPOSE=false                  # optional, default false
```

**Behavior:**

- `ALLOWED_PATHS` empty (default) → permissive mode: all actions available for all containers
- `ALLOWED_PATHS` with values → strict mode:
  - **Visualization, stats and logs:** always available for all containers (visibility comes from the Docker socket)
  - **Actions** (start/stop/restart/rebuild/remove/exec): only allowed if the container's compose file is under an allowed path
  - Containers outside the paths appear with a **lock icon 🔒** and all their actions are disabled
  - The context menu and detail panel show a "View-only" badge

**`ALLOW_NON_COMPOSE`** controls what happens with manually-run containers (`docker run` without compose labels):

- `false` (default): blocks actions — view-only for non-compose containers
- `true`: allows actions on non-compose containers (useful if you have utility containers like Portainer agent, Watchtower, etc.)

**Multi-user example:**

```bash
# Shared server with jorge, israel, pedro, nayeli
# Each runs their own ContainerFlow instance on a different port
# jorge's:
ALLOWED_PATHS=/home/jorge

# israel's:
ALLOWED_PATHS=/home/israel
```

Each one sees **all** the server's containers, but can only rebuild/restart/exec their own.

**Relevant endpoint:** `GET /api/config` returns the active config (consumed by the frontend to disable buttons).

## Stack

| Component | Technology |
|---|---|
| Runtime | Bun |
| Server | Hono |
| Frontend | React 19 + Vite 6 |
| Graph | @xyflow/react 12 |
| Styles | Tailwind CSS 4 |
| Icons | Lucide React |
| Docker API | dockerode |
| Communication | Native WebSocket |
| Tests | Vitest |

## Structure

```
src/
  server/
    index.ts             — Hono server + WebSocket + CLI args + REST API
    docker.ts            — service and connection discovery
    watcher.ts           — stats polling + Docker events stream (computeMemoryBreakdown)
    stats-db.ts          — SQLite stats history (insert, query by range, 7d cleanup)
    events-db.ts         — SQLite events_log + notifications_log
    discord.ts           — Discord webhooks (state changes, resource alerts, cooldown, debounce, queue)
    container-settings.ts — per-container overrides (thresholds and notification toggle)
  client/
    App.tsx          — main dashboard + login screen
    main.tsx         — React entry point
    index.css        — Tailwind + custom animations
    i18n.tsx         — translations EN + ES, useT() hook
    nodes/
      ServiceNode.tsx — visual node per container
      GroupNode.tsx    — group header (project/compose)
    hooks/
      useDocker.ts        — WebSocket hook for real-time data + action error toasts
      useServerConfig.ts  — fetch /api/config + canInteract() helper for ALLOWED_PATHS
      useStatsHistory.ts  — fetch stats history by range (1h/6h/24h/7d)
      useStatsStore.ts    — in-memory store for live stats
      processing.ts       — pure processing state logic
    engine/
      layout.ts      — group layout + grid + edges
    components/
      HeaderBar.tsx        — top navigation bar with notification bell
      EdgeLegend.tsx       — connection type legend
      LoginScreen.tsx      — authentication screen
      NodeContextMenu.tsx  — node context menu (disabled when locked)
      OffsetEdge.tsx       — custom edge with offset to avoid overlap
      Sparkline.tsx        — lightweight line chart for stats history
      StatsCard.tsx        — metric card with sparkline, hover, average and threshold
      ThresholdBar.tsx     — per-container threshold slider with override/reset
      ActionErrorToast.tsx — top-right toast stack for action errors
      Tooltip.tsx          — info tooltip with portal + smart placement
    panels/
      DetailPanel.tsx — side panel with info, stats, env, config and logs
      LogPanel.tsx    — log panel per container
    pages/
      MonitoringPage.tsx — CPU/RAM history, Docker events and per-container thresholds
      SettingsPage.tsx   — configuration (auth, Discord webhook, events, global thresholds)
  shared/
    types.ts         — shared server/client types
```

## Community and contributions

ContainerFlow is in active development (`v0.x`).

- 🐛 **Bug?** Open an [issue](https://github.com/RGJorge/containerflow/issues/new?template=bug_report.md)
- 💡 **Idea?** Open a [feature request](https://github.com/RGJorge/containerflow/issues/new?template=feature_request.md)
- 💬 **Discussion / question?** Open a [discussion](https://github.com/RGJorge/containerflow/discussions)
- 🔒 **Security vulnerability?** Report privately — see [SECURITY.md](SECURITY.md)
- 📜 **Code of Conduct** — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 🛠 **Want to contribute code?** — see [CONTRIBUTING.md](CONTRIBUTING.md). Currently we only accept issues; PRs will open as the project matures and patterns stabilize.

If ContainerFlow is useful to you, a ⭐ on GitHub helps project visibility.

## License

Copyright (C) 2026 Jorge Gonzalez D. (RGJorge)

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See the [LICENSE](LICENSE) file for full terms.

For commercial use with closed source, contact for a commercial license: alteonx.servicios@gmail.com
