import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import path from "path";
import fs from "fs";
import { docker, discoverServices, discoverConnections, getContainerLogs, streamContainerLogs } from "./docker";
import { pollStats, watchDockerEvents } from "./watcher";
import { computeGraphDiff } from "./diff";
import { loadDiscordConfig, saveDiscordConfig, notifyStateChange, notifyResourceAlert, notifyUIAction, notifyActionError, testWebhook, checkDownServices, setNotificationListener } from "./discord";
import { loadContainerSettings, saveContainerSettings } from "./container-settings";
import { loadProjectAliases, saveProjectAliases, sanitizeAlias } from "./project-aliases";
import { loadProjectColors, saveProjectColors, sanitizeColor } from "./project-colors";
import { getUpdateInfo } from "./update-check";
import pkg from "../../package.json";
import { initStatsDB, insertStats, getStatsHistory, getAllServicesStatsHistory } from "./stats-db";
import { initEventsDB, insertEvent, insertNotification, getEvents, getNotifications, type EventLogEntry, type NotificationLogEntry } from "./events-db";
import type { Service, Connection, Stats, WSMessage, DiscordConfig, ContainerSettings, StatsRange } from "../shared/types";

/** Directory for persistent data files (SQLite, JSON configs, positions).
 *  Default: ./data subdirectory of cwd. Override via DATA_DIR env var. */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Paths under which actions (start/stop/restart/rebuild/remove/exec) are allowed.
 *  Empty = permissive mode (all actions allowed on all containers).
 *  Set = strict mode (actions only allowed for compose files under these paths). */
const ALLOWED_PATHS = (process.env.ALLOWED_PATHS || "")
  .split(":")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => p.replace(/\/+$/, "")); // strip trailing slashes

/** When ALLOWED_PATHS is set, allow actions on non-compose containers (no compose label). */
const ALLOW_NON_COMPOSE = process.env.ALLOW_NON_COMPOSE === "true";

/** Strict mode is active when ALLOWED_PATHS has at least one entry. */
const RESTRICTED_MODE = ALLOWED_PATHS.length > 0;

/** Returns true if filePath is under one of the allowed prefixes. */
function isPathAllowed(filePath: string): boolean {
  if (!RESTRICTED_MODE) return true;
  const normalized = path.resolve(filePath);
  return ALLOWED_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(prefix + "/"));
}

/** Returns null if container can be acted upon, or an error message string if not. */
function checkContainerAccess(info: { Config?: { Labels?: Record<string, string> } }): string | null {
  if (!RESTRICTED_MODE) return null;
  const composeFile = info.Config?.Labels?.["com.docker.compose.project.config_files"];
  if (!composeFile) {
    if (ALLOW_NON_COMPOSE) return null;
    return "This container has no compose file. Actions are restricted in this mode (ALLOWED_PATHS is set, ALLOW_NON_COMPOSE is false).";
  }
  if (!isPathAllowed(composeFile)) {
    return `Container's compose file is outside ALLOWED_PATHS:\n  ${composeFile}\n\nAllowed paths:\n${ALLOWED_PATHS.map((p) => `  ${p}`).join("\n")}`;
  }
  return null;
}

/** Env-file overrides per compose file (persisted to file) */
const ENV_FILES_FILE = path.join(DATA_DIR, ".dockerflow-env-files.json");

function loadEnvFiles(): Record<string, string> {
  try {
    if (fs.existsSync(ENV_FILES_FILE)) {
      return JSON.parse(fs.readFileSync(ENV_FILES_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

/** Build env-file args for docker compose by detecting .env files next to the compose file */
function findEnvFileArgs(composeFile: string): string[] {
  // Check for user override first
  const overrides = loadEnvFiles();
  const override = overrides[composeFile];
  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.join(path.dirname(composeFile), override);
    if (fs.existsSync(resolved)) {
      return ["--env-file", resolved];
    }
  }

  // Auto-detect heuristic
  const dir = path.dirname(composeFile);
  const baseName = path.basename(composeFile, path.extname(composeFile)); // e.g. "docker-compose.prod"
  const candidates: string[] = [];

  // Prefer specific env file matching compose name (e.g. .env.prod for docker-compose.prod.yml)
  const suffix = baseName.replace(/^docker-compose\.?/, ""); // "prod" or ""
  if (suffix) {
    candidates.push(path.join(dir, `.env.${suffix}`));
  }
  candidates.push(path.join(dir, ".env"));

  for (const envFile of candidates) {
    if (fs.existsSync(envFile)) {
      return ["--env-file", envFile];
    }
  }
  return [];
}

const app = new Hono();

// ── Compression ──
app.use("*", compress());

// ── CORS ──
app.use("/api/*", cors());

// ── CLI args ──
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const projectsFlag = args.find((a) => a.startsWith("--projects="));
const PROJECTS = projectsFlag
  ? projectsFlag.split("=")[1]!.split(",")
  : ALL
    ? []
    : [path.basename(process.cwd())];

// ── Config ──
const PORT = parseInt(process.env.PORT || "9470");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";
const POLL_INTERVAL_MS = 5000;
const WS_RECONNECT_MS = 3000;

// ── Rate limiting (in-memory, per IP) ──
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count++;
  }
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failedAttempts) {
    if (now > entry.resetAt) failedAttempts.delete(ip);
  }
}, 5 * 60_000);

// ── Auth middleware ──
if (AUTH_TOKEN) {
  app.use("*", async (c, next) => {
    // Skip static assets and auth page
    if (c.req.path === "/" || c.req.path.startsWith("/assets") || c.req.path.endsWith(".png") || c.req.path.endsWith(".webp") || c.req.path.endsWith(".ico")) return next();
    if (c.req.path === "/api/auth") return next();

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) return c.json({ error: "Too many failed attempts. Try again later." }, 429);

    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) {
      recordFailedAttempt(ip);
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });
}

// ── API ──
app.get("/api/services", async (c) => {
  const services = await discoverServices(ALL, PROJECTS);
  return c.json(services);
});

app.get("/api/connections", async (c) => {
  const services = await discoverServices(ALL, PROJECTS);
  const connections = await discoverConnections(services);
  return c.json(connections);
});

app.get("/api/health", (c) => c.json({ ok: true, mode: ALL ? "all" : "filtered", projects: PROJECTS }));

// ── Combined init endpoint (services + connections + positions in one call) ──
app.get("/api/init", async (c) => {
  const services = await discoverServices(ALL, PROJECTS);
  const connections = await discoverConnections(services);
  let positions: Record<string, any> = {};
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf-8"));
    }
  } catch {}
  // Return cached stats (may be empty briefly during cold start).
  // We deliberately do NOT trigger a fresh pollStats here — on cold start
  // with many containers it can exceed Bun's 10s request timeout and hang
  // the dashboard. The first regular poll (within ~3s) populates via WS.
  const projectAliases = loadProjectAliases();
  const projectColors = loadProjectColors();
  // Update info: best-effort, never block init. If the check fails (offline,
  // rate-limit), return null so the UI just doesn't show a notification.
  let updateInfo = null;
  try {
    updateInfo = await getUpdateInfo(pkg.version);
  } catch {}
  return c.json({ services, connections, positions, stats: lastStats, projectAliases, projectColors, updateInfo });
});

// ── Server config (read by frontend to disable buttons for non-allowed paths) ──
app.get("/api/config", (c) => {
  return c.json({
    allowedPaths: ALLOWED_PATHS,
    allowNonCompose: ALLOW_NON_COMPOSE,
    restrictedMode: RESTRICTED_MODE,
  });
});

// ── Helper: get service uid from container inspect info ──
function getContainerUid(info: any): string {
  const project = info.Config?.Labels?.["com.docker.compose.project"] || "docker";
  const service = info.Config?.Labels?.["com.docker.compose.service"] || info.Name?.replace(/^\//, "") || "unknown";
  return `${project}/${service}`;
}

// ── Container actions ──
app.post("/api/containers/:id/stop", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    await container.stop();
    immediateRefresh();
    const uid = getContainerUid(info);
    try { notifyUIAction(uid, "stop", loadDiscordConfig()); } catch {}
    return c.json({ ok: true });
  } catch (err: any) {
    if (err?.statusCode === 304) return c.json({ ok: true, message: "Already stopped" });
    return c.json({ error: err?.message || "Failed to stop container" }, 500);
  }
});

app.post("/api/containers/:id/start", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    await container.start();
    immediateRefresh();
    const uid = getContainerUid(info);
    try { notifyUIAction(uid, "start", loadDiscordConfig()); } catch {}
    return c.json({ ok: true });
  } catch (err: any) {
    if (err?.statusCode === 304) return c.json({ ok: true, message: "Already running" });
    return c.json({ error: err?.message || "Failed to start container" }, 500);
  }
});

app.post("/api/containers/:id/restart", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    await container.restart();
    immediateRefresh();
    const uid = getContainerUid(info);
    try { notifyUIAction(uid, "restart", loadDiscordConfig()); } catch {}
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to restart container" }, 500);
  }
});

app.post("/api/containers/:id/rebuild", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    const composeFile = info.Config?.Labels?.["com.docker.compose.project.config_files"];
    const serviceName = info.Config?.Labels?.["com.docker.compose.service"];
    const project = info.Config?.Labels?.["com.docker.compose.project"] || "docker";
    if (!composeFile || !serviceName) {
      return c.json({ error: "Not a Compose service — rebuild requires docker-compose" }, 400);
    }
    if (!fs.existsSync(composeFile)) {
      const dir = path.dirname(composeFile);
      return c.json({
        error:
          `Compose file not accessible from ContainerFlow:\n` +
          `  ${composeFile}\n\n` +
          `Este path existe en el host pero no está montado dentro del container de ContainerFlow.\n\n` +
          `Fix: agrega este volumen a docker-compose.yml de ContainerFlow:\n` +
          `  - ${dir}:${dir}:ro\n\n` +
          `O usa la variable HOST_PROJECTS_DIR en .env:\n` +
          `  HOST_PROJECTS_DIR=${dir}\n\n` +
          `Luego: docker compose up -d --force-recreate containerflow`,
      }, 400);
    }
    const uid = `${project}/${serviceName}`;
    const envArgs = findEnvFileArgs(composeFile);
    // Run rebuild in background — respond immediately
    const proc = Bun.spawn(["docker", "compose", "-f", composeFile, ...envArgs, "up", "--build", "-d", serviceName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.exited.then(async (exitCode) => {
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        const errorMsg = stderr || `Rebuild failed with exit code ${exitCode}`;
        broadcast({ type: "action_error", data: { uid, action: "rebuild", error: errorMsg } });
        try { notifyActionError(uid, "rebuild", errorMsg, loadDiscordConfig()); } catch {}
      } else {
        try { notifyUIAction(uid, "rebuild", loadDiscordConfig()); } catch {}
      }
      scheduleRefresh();
    }).catch((err) => {
      const errorMsg = err?.message || "Rebuild failed";
      broadcast({ type: "action_error", data: { uid, action: "rebuild", error: errorMsg } });
      try { notifyActionError(uid, "rebuild", errorMsg, loadDiscordConfig()); } catch {}
    });
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to rebuild container" }, 500);
  }
});

app.post("/api/containers/:id/recreate", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    const composeFile = info.Config?.Labels?.["com.docker.compose.project.config_files"];
    const serviceName = info.Config?.Labels?.["com.docker.compose.service"];
    const project = info.Config?.Labels?.["com.docker.compose.project"] || "docker";
    if (!composeFile || !serviceName) {
      return c.json({ error: "Not a Compose service — recreate requires docker-compose" }, 400);
    }
    if (!fs.existsSync(composeFile)) {
      const dir = path.dirname(composeFile);
      return c.json({
        error:
          `Compose file not accessible from ContainerFlow:\n` +
          `  ${composeFile}\n\n` +
          `Fix: agrega a docker-compose.yml de ContainerFlow:\n` +
          `  - ${dir}:${dir}:ro\n\n` +
          `Luego: docker compose up -d --force-recreate containerflow`,
      }, 400);
    }
    const uid = `${project}/${serviceName}`;
    const envArgs = findEnvFileArgs(composeFile);
    // Recreate uses existing image (no --build), only re-applies compose config
    const proc = Bun.spawn(["docker", "compose", "-f", composeFile, ...envArgs, "up", "--force-recreate", "-d", serviceName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.exited.then(async (exitCode) => {
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        const errorMsg = stderr || `Recreate failed with exit code ${exitCode}`;
        broadcast({ type: "action_error", data: { uid, action: "recreate", error: errorMsg } });
        try { notifyActionError(uid, "recreate", errorMsg, loadDiscordConfig()); } catch {}
      } else {
        try { notifyUIAction(uid, "recreate", loadDiscordConfig()); } catch {}
      }
      scheduleRefresh();
    }).catch((err) => {
      const errorMsg = err?.message || "Recreate failed";
      broadcast({ type: "action_error", data: { uid, action: "recreate", error: errorMsg } });
      try { notifyActionError(uid, "recreate", errorMsg, loadDiscordConfig()); } catch {}
    });
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to recreate container" }, 500);
  }
});

app.post("/api/containers/:id/remove", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    const composeFile = info.Config?.Labels?.["com.docker.compose.project.config_files"];
    const serviceName = info.Config?.Labels?.["com.docker.compose.service"];
    if (!composeFile || !serviceName) {
      // Not a compose service — just stop and remove the container
      try { await container.stop(); } catch {}
      await container.remove({ force: true });
      return c.json({ ok: true });
    }
    if (!fs.existsSync(composeFile)) {
      const dir = path.dirname(composeFile);
      return c.json({
        error:
          `Compose file not accessible from ContainerFlow:\n` +
          `  ${composeFile}\n\n` +
          `Fix: agrega a docker-compose.yml de ContainerFlow:\n` +
          `  - ${dir}:${dir}:ro\n\n` +
          `Luego: docker compose up -d --force-recreate containerflow`,
      }, 400);
    }
    const envArgs = findEnvFileArgs(composeFile);
    const proc = Bun.spawn(["docker", "compose", "-f", composeFile, ...envArgs, "rm", "-sf", serviceName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return c.json({ error: stderr || `Remove failed with exit code ${exitCode}` }, 500);
    }
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to remove container" }, 500);
  }
});

app.post("/api/containers/:id/exec", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const denied = checkContainerAccess(info);
    if (denied) return c.json({ error: denied }, 403);
    const body = await c.req.json();
    const cmd = body?.cmd;
    if (!cmd || typeof cmd !== "string") return c.json({ error: "Missing cmd" }, 400);

    // Parse command respecting quotes
    const parts: string[] = [];
    let current = "";
    let inQuote: string | null = null;
    for (const ch of cmd) {
      if (inQuote) {
        if (ch === inQuote) { inQuote = null; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === " ") {
        if (current) { parts.push(current); current = ""; }
      } else {
        current += ch;
      }
    }
    if (current) parts.push(current);
    if (parts.length === 0) return c.json({ error: "Empty command" }, 400);

    const exec = await container.exec({ Cmd: parts, AttachStdout: true, AttachStderr: true });
    const stream = await exec.start({});

    // Collect output using dockerode's demuxStream
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      const passStdout = new (require("stream").PassThrough)();
      const passStderr = new (require("stream").PassThrough)();
      passStdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      passStderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      docker.modem.demuxStream(stream, passStdout, passStderr);
      stream.on("end", resolve);
      stream.on("error", resolve);
      setTimeout(resolve, 30000);
    });

    const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
    const stderr = Buffer.concat(stderrChunks).toString("utf-8");
    const output = (stdout + stderr).trim();

    const inspect = await exec.inspect();
    return c.json({ ok: true, output, exitCode: inspect.ExitCode ?? -1 });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to exec" }, 500);
  }
});

app.get("/api/logs/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    return c.json({ error: "Invalid container ID" }, 400);
  }
  const tail = Math.min(Math.max(parseInt(c.req.query("tail") || "200") || 200, 1), 5000);
  const since = c.req.query("since") ? parseInt(c.req.query("since")!) : undefined;
  try {
    const lines = await getContainerLogs(id, tail, since);
    return c.json(lines);
  } catch (err) {
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

// ── Node positions (persisted to file) ──
const POSITIONS_FILE = path.join(DATA_DIR, ".dockerflow-positions.json");

app.get("/api/positions", (c) => {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf-8"));
      return c.json(data);
    }
  } catch (err) {
    console.error("Failed to read positions file:", err);
  }
  return c.json({});
});

app.put("/api/positions", async (c) => {
  try {
    const body = await c.req.json();
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(body, null, 2));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

// ── Env-file overrides (persisted to file) ──
app.get("/api/env-files", (c) => {
  return c.json(loadEnvFiles());
});

app.put("/api/env-files", async (c) => {
  try {
    const body = await c.req.json();
    fs.writeFileSync(ENV_FILES_FILE, JSON.stringify(body, null, 2));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

app.get("/api/env-files/detect/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) return c.json({ error: "Invalid container ID" }, 400);
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    const composeFile = info.Config?.Labels?.["com.docker.compose.project.config_files"];
    if (!composeFile) return c.json({ files: [], composeFile: null });
    const dir = path.dirname(composeFile);
    const entries = fs.readdirSync(dir);
    const envFiles = entries.filter((e: string) => e.startsWith(".env") && !e.endsWith(".example") && !e.endsWith(".sample"))
      .map((e: string) => e)
      .sort();
    return c.json({ files: envFiles, composeFile });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to detect env files" }, 500);
  }
});

// ── Discord config ──
app.get("/api/discord-config", (c) => {
  return c.json(loadDiscordConfig());
});

app.put("/api/discord-config", async (c) => {
  try {
    const body = await c.req.json() as DiscordConfig;
    if (body.webhookUrl && !body.webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      return c.json({ error: "Invalid webhook URL. Must start with https://discord.com/api/webhooks/" }, 400);
    }
    saveDiscordConfig(body);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

app.post("/api/discord-config/test", async (c) => {
  try {
    const body = await c.req.json();
    const url = body?.webhookUrl;
    if (!url || !url.startsWith("https://discord.com/api/webhooks/")) {
      return c.json({ error: "Invalid webhook URL" }, 400);
    }
    const result = await testWebhook(url);
    return c.json(result);
  } catch {
    return c.json({ error: "Failed to test webhook" }, 500);
  }
});

// ── Container settings ──
app.get("/api/container-settings", (c) => {
  return c.json(loadContainerSettings());
});

app.put("/api/container-settings", async (c) => {
  try {
    const body = await c.req.json() as { uid: string; settings: ContainerSettings };
    if (!body.uid || !body.settings) {
      return c.json({ error: "Missing uid or settings" }, 400);
    }
    const all = loadContainerSettings();
    all[body.uid] = body.settings;
    saveContainerSettings(all);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

// ── Project aliases ──
app.get("/api/project-aliases", (c) => {
  return c.json(loadProjectAliases());
});

app.put("/api/project-aliases", async (c) => {
  try {
    const body = await c.req.json() as { project: string; alias: string };
    if (!body.project) {
      return c.json({ error: "Missing project" }, 400);
    }
    const aliases = loadProjectAliases();
    const clean = sanitizeAlias(body.alias || "");
    if (clean) {
      aliases[body.project] = clean;
    } else {
      // Empty alias = reset to original (remove the entry)
      delete aliases[body.project];
    }
    saveProjectAliases(aliases);
    return c.json({ ok: true, alias: clean || null });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

app.delete("/api/project-aliases/:project", (c) => {
  const project = c.req.param("project");
  if (!project) {
    return c.json({ error: "Missing project" }, 400);
  }
  const aliases = loadProjectAliases();
  delete aliases[project];
  saveProjectAliases(aliases);
  return c.json({ ok: true });
});

// ── Project colors ──
app.get("/api/project-colors", (c) => {
  return c.json(loadProjectColors());
});

app.put("/api/project-colors", async (c) => {
  try {
    const body = await c.req.json() as { project: string; color: string };
    if (!body.project) {
      return c.json({ error: "Missing project" }, 400);
    }
    const colors = loadProjectColors();
    const clean = sanitizeColor(body.color || "");
    if (clean) {
      colors[body.project] = clean;
    } else {
      delete colors[body.project];
    }
    saveProjectColors(colors);
    return c.json({ ok: true, color: clean || null });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

app.delete("/api/project-colors/:project", (c) => {
  const project = c.req.param("project");
  if (!project) {
    return c.json({ error: "Missing project" }, 400);
  }
  const colors = loadProjectColors();
  delete colors[project];
  saveProjectColors(colors);
  return c.json({ ok: true });
});

// ── Update info ──
app.get("/api/update-info", async (c) => {
  try {
    const info = await getUpdateInfo(pkg.version);
    return c.json(info);
  } catch {
    // Silent fallback — never error the client with this metadata call.
    return c.json({
      current: pkg.version,
      latest: null,
      updateAvailable: false,
      releasesAhead: 0,
      releaseUrl: null,
      repoUrl: "https://github.com/RGJorge/ContainerFlow",
      releaseNotes: null,
      publishedAt: null,
      deployMode: "unknown",
      stars: null,
    });
  }
});

// ── Stats history ──
const VALID_RANGES = new Set(["1h", "6h", "24h", "7d"]);

app.get("/api/stats/history/:uid{.+}", (c) => {
  const uid = c.req.param("uid");
  const range = (c.req.query("range") || "1h") as StatsRange;
  if (!VALID_RANGES.has(range)) return c.json({ error: "Invalid range" }, 400);
  return c.json(getStatsHistory(uid, range));
});

app.get("/api/stats/history", (c) => {
  const range = (c.req.query("range") || "1h") as StatsRange;
  if (!VALID_RANGES.has(range)) return c.json({ error: "Invalid range" }, 400);
  return c.json(getAllServicesStatsHistory(range));
});

// ── Events + Notifications log ──
app.get("/api/events", (c) => {
  const limit = parseInt(c.req.query("limit") || "200");
  const service = c.req.query("service") || undefined;
  const action = c.req.query("action") || undefined;
  const since = c.req.query("since") ? parseInt(c.req.query("since")!) : undefined;
  return c.json(getEvents({ limit, service, action, since }));
});

app.get("/api/notifications", (c) => {
  const limit = parseInt(c.req.query("limit") || "100");
  const type = c.req.query("type") || undefined;
  const level = c.req.query("level") || undefined;
  const since = c.req.query("since") ? parseInt(c.req.query("since")!) : undefined;
  return c.json(getNotifications({ limit, type, level, since }));
});

// ── Cache headers for static assets ──
app.use("/*", async (c, next) => {
  await next();
  const p = c.req.path;
  if (p.startsWith("/assets/")) {
    // Hashed filenames — cache forever
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  } else if (p.endsWith(".webp") || p.endsWith(".png") || p.endsWith(".ico")) {
    c.header("Cache-Control", "public, max-age=86400");
  }
});

// ── Serve frontend build ──
app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ root: "./dist", path: "index.html" }));

// ── WebSocket ──
const clients = new Set<WebSocket>();
const authenticatedClients = new Set<WebSocket>();
const logStreams = new Map<WebSocket, { destroy: () => void }>();

function isAuthenticated(ws: WebSocket): boolean {
  return !AUTH_TOKEN || authenticatedClients.has(ws);
}

function broadcast(msg: WSMessage) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (!isAuthenticated(ws)) continue;
    try {
      ws.send(data);
    } catch {}
  }
}

function cleanupLogStream(ws: WebSocket) {
  const stream = logStreams.get(ws);
  if (stream) {
    logStreams.delete(ws);
    try {
      stream.destroy();
    } catch (err) {
      console.error("Failed to destroy log stream:", err);
    }
  }
}

/** Send full graph + stats snapshot to a newly connected client.
 *  Uses cached state if available; falls back to a fresh discover on cold start. */
function sendSnapshot(ws: WebSocket): void {
  if (lastBroadcastedServices.length > 0) {
    try {
      ws.send(JSON.stringify({ type: "snapshot", data: { services: lastBroadcastedServices, connections: lastBroadcastedConnections } }));
      if (lastStats.length > 0) ws.send(JSON.stringify({ type: "stats", data: lastStats }));
    } catch {}
    return;
  }
  // Cold start: no data yet — do a fresh discover
  discoverServices(ALL, PROJECTS).then(async (services) => {
    const connections = await discoverConnections(services);
    lastBroadcastedServices = services;
    lastBroadcastedConnections = connections;
    try {
      ws.send(JSON.stringify({ type: "snapshot", data: { services, connections } }));
      if (lastStats.length > 0) ws.send(JSON.stringify({ type: "stats", data: lastStats }));
    } catch {}
  }).catch(() => {});
}

// ── Docker events ──
let servicesLock = false;
let statsLock = false;

async function refreshServices() {
  if (servicesLock) return;
  servicesLock = true;
  try {
    const services = await discoverServices(ALL, PROJECTS);
    const connections = await discoverConnections(services);

    const diff = computeGraphDiff(
      lastBroadcastedServices, services,
      lastBroadcastedConnections, connections,
    );
    if (diff) {
      lastBroadcastedServices = services;
      lastBroadcastedConnections = connections;
      broadcast({ type: "diff", data: diff });
    }

    // Stats polling is separate — don't block services refresh
    refreshStats(services);
  } catch (err) {
    console.error("Refresh error:", err);
  } finally {
    servicesLock = false;
  }
}

let statsLockTimer: ReturnType<typeof setTimeout> | undefined;
async function refreshStats(services: Service[]) {
  if (statsLock) return;
  statsLock = true;
  // Safety: force-unlock after 30s in case pollStats hangs
  clearTimeout(statsLockTimer);
  statsLockTimer = setTimeout(() => { statsLock = false; }, 30000);
  try {
    const stats = await pollStats(services);
    lastStats = stats; // cache for /api/init (avoid 3s wait on page load)
    broadcast({ type: "stats", data: stats });
    try { insertStats(stats); } catch {}
    // Check resource thresholds and down services for Discord alerts
    try {
      const discordConfig = loadDiscordConfig();
      if (discordConfig.enabled) {
        if (discordConfig.events.resourceAlerts) {
          const containerSettings = loadContainerSettings();
          for (const stat of stats) {
            const cs = containerSettings[stat.service];
            if (cs && cs.notificationsEnabled === false) continue;
            const cpuThreshold = cs?.cpuThreshold ?? discordConfig.thresholds.cpuPercent;
            const memThreshold = cs?.memThreshold ?? discordConfig.thresholds.memPercent;
            if (stat.cpu >= cpuThreshold) {
              notifyResourceAlert(stat.service, "cpu", stat.cpu, cpuThreshold, discordConfig);
            }
            if (stat.mem_percent >= memThreshold) {
              notifyResourceAlert(stat.service, "memory", stat.mem_percent, memThreshold, discordConfig);
            }
          }
        }
        checkDownServices(discordConfig);
      }
    } catch {}
  } catch (err) {
    console.error("Stats error:", err);
  } finally {
    clearTimeout(statsLockTimer);
    statsLock = false;
  }
}

// Debounced refresh for Docker events
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  clearTimeout(retryTimer);
  refreshTimer = setTimeout(() => {
    refreshServices();
    retryTimer = setTimeout(refreshServices, 1500);
  }, 500);
}

// Immediate refresh after action endpoints (container already changed state)
function immediateRefresh() {
  clearTimeout(refreshTimer);
  clearTimeout(retryTimer);
  refreshServices();
}

// Actions worth persisting in the events log. `stop` is intentionally excluded
// — Docker emits BOTH `stop` (command issued) and `die` (process terminated)
// when stopping a container, which results in duplicate entries. `die` always
// fires when a container exits (intentional stop or crash), so it covers both.
const PERSISTED_ACTIONS = new Set(["start", "die", "restart", "health_status"]);

watchDockerEvents((event) => {
  broadcast({ type: "docker_event", data: event });
  scheduleRefresh();
  // Persist to events log only if action is meaningful + non-duplicate
  if (PERSISTED_ACTIONS.has(event.action)) {
    try {
      const entry = insertEvent(event.service, event.action, "docker");
      if (entry) broadcast({ type: "event_log", data: entry } as any);
    } catch {}
  }
  try {
    const config = loadDiscordConfig();
    notifyStateChange(event.service, event.action, config);
  } catch {}
});

// ── Graph state (used for diff computation and new-client snapshots) ──
let lastBroadcastedServices: Service[] = [];
let lastBroadcastedConnections: Connection[] = [];
/** Last stats snapshot — sent in /api/init so frontend has data immediately
 *  instead of waiting for the next polling cycle (~3s wait). */
let lastStats: Stats[] = [];

setInterval(refreshServices, POLL_INTERVAL_MS);

// ── Init persistent DBs ──
initStatsDB();
initEventsDB();

// Wire up notification listener so new notifications stream to UI via WebSocket
setNotificationListener((entry) => {
  try { broadcast({ type: "notification_log", data: entry } as any); } catch {}
});

// ── Start ──
const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade (auth handled via first message)
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      const native = ws as unknown as WebSocket;
      clients.add(native);

      if (!AUTH_TOKEN) {
        sendSnapshot(native);
      }
    },
    close(ws) {
      const native = ws as unknown as WebSocket;
      cleanupLogStream(native);
      clients.delete(native);
      authenticatedClients.delete(native);
    },
    message(ws, message) {
      try {
        const msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message as unknown as ArrayBuffer));
        const native = ws as unknown as WebSocket;

        // Handle authentication via first message
        if (msg.type === "auth") {
          const wsIp = (ws as any).remoteAddress || "unknown";
          if (AUTH_TOKEN && isRateLimited(wsIp)) {
            native.send(JSON.stringify({ type: "auth_error", reason: "rate_limited" }));
            native.close();
            return;
          }
          if (msg.token === AUTH_TOKEN) {
            authenticatedClients.add(native);
            native.send(JSON.stringify({ type: "auth_ok" }));
            sendSnapshot(native);
          } else {
            if (AUTH_TOKEN) recordFailedAttempt(wsIp);
            native.send(JSON.stringify({ type: "auth_error" }));
            native.close();
          }
          return;
        }

        // Reject messages from unauthenticated clients
        if (!isAuthenticated(native)) return;

        if (msg.type === "subscribe_logs" && msg.container) {
          cleanupLogStream(native);

          const stream = streamContainerLogs(msg.container, (line) => {
            try {
              native.send(JSON.stringify({ type: "log_line", data: line }));
            } catch {}
          });
          logStreams.set(native, stream);
        } else if (msg.type === "unsubscribe_logs") {
          cleanupLogStream(native);
        }
      } catch (err) {
        console.error("Failed to handle WS message:", err);
      }
    },
  },
});

const mode = ALL ? "all projects" : `project(s): ${PROJECTS.join(", ")}`;
console.log(`\n  ContainerFlow`);
console.log(`  → http://${HOST}:${PORT}`);
console.log(`  → Mode: ${mode}`);
console.log(`  → Auth: ${AUTH_TOKEN ? "enabled" : "disabled (localhost only)"}\n`);
