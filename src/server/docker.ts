import Docker from "dockerode";
import fs from "fs";
import type { Service, Connection, LogLine } from "../shared/types";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST;

if (!isTest && !fs.existsSync(DOCKER_SOCKET)) {
  console.error(`\n  Error: Docker socket not found at ${DOCKER_SOCKET}`);
  console.error(`  Make sure Docker is running or set DOCKER_SOCKET env var.\n`);
  process.exit(1);
}

const docker = new Docker({ socketPath: DOCKER_SOCKET });

export { docker };

export async function discoverServices(all: boolean, projects: string[]): Promise<Service[]> {
  const containers = await docker.listContainers({ all: true });

  // Inspect containers in parallel to get detailed info
  const inspections = await Promise.all(
    containers.map((c) =>
      docker.getContainer(c.Id).inspect().catch(() => null)
    )
  );

  let services: Service[] = containers.map((c, i) => {
    const name = c.Labels["com.docker.compose.service"] || c.Names[0]?.replace("/", "") || "unknown";
    const project = c.Labels["com.docker.compose.project"] || "docker";
    const info = inspections[i] as any;

    // Extract network IPs
    const networkIps: Record<string, string> = {};
    const nets = info?.NetworkSettings?.Networks || {};
    for (const [netName, netInfo] of Object.entries(nets)) {
      const ip = (netInfo as any)?.IPAddress;
      if (ip) networkIps[netName] = ip;
    }

    // Health check
    const healthState = info?.State?.Health;
    const healthStatus = healthState?.Status || "";
    const healthLog = (healthState?.Log || [])
      .slice(-5)
      .map((entry: any) => `[${entry.ExitCode}] ${entry.Output?.trim() || ""}`)
      .filter((s: string) => s.length > 4);

    const exitCode: number = info?.State?.ExitCode ?? 0;
    const restartCount: number = info?.RestartCount ?? 0;
    const oomKilled: boolean = info?.State?.OOMKilled ?? false;

    // Detect crashed: exited with non-zero exit code or OOM killed
    const rawState = c.State as string;
    const isCrashed = rawState === "exited" && (exitCode !== 0 || oomKilled);
    const state: Service["state"] = isCrashed ? "crashed" : rawState as Service["state"];

    return {
      id: c.Id.slice(0, 12),
      uid: `${project}/${name}`,
      name,
      image: c.Image,
      state,
      status: c.Status,
      ports: [...new Map(
        c.Ports.filter((p) => p.PublicPort).map((p) => [
          `${p.PublicPort}:${p.PrivatePort}`,
          { host: p.PublicPort!, container: p.PrivatePort },
        ])
      ).values()],
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
      network_ips: networkIps,
      project,
      compose_file: c.Labels["com.docker.compose.project.config_files"] || "",
      env: (info?.Config?.Env || []) as string[],
      restart_policy: info?.HostConfig?.RestartPolicy?.Name || "",
      memory_limit: info?.HostConfig?.Memory || 0,
      cpu_quota: info?.HostConfig?.CpuQuota || (info?.HostConfig?.NanoCpus ? Math.round(info.HostConfig.NanoCpus / 1e4) : 0),
      health_status: healthStatus,
      health_log: healthLog,
      exit_code: exitCode,
      restart_count: restartCount,
      oom_killed: oomKilled,
      mounts: (info?.Mounts || []).map((m: any) => ({
        type: m.Type || "bind",
        source: m.Source || "",
        destination: m.Destination || "",
        name: m.Name || undefined,
        driver: m.Driver || undefined,
        mode: m.Mode || "",
        rw: m.RW !== false,
      })),
    };
  });

  if (!all && projects.length > 0) {
    services = services.filter((s) => projects.includes(s.project));
  }

  return services;
}

// ── Infrastructure service detection ──
// These are services that OTHER services connect TO (databases, caches, brokers, proxies)

const INFRA_PATTERNS: { pattern: string; type: string; label: string; role: "target" }[] = [
  { pattern: "postgres", type: "database", label: "postgres", role: "target" },
  { pattern: "mysql", type: "database", label: "mysql", role: "target" },
  { pattern: "mariadb", type: "database", label: "mariadb", role: "target" },
  { pattern: "mongo", type: "database", label: "mongo", role: "target" },
  { pattern: "redis", type: "cache", label: "redis", role: "target" },
  { pattern: "memcached", type: "cache", label: "memcached", role: "target" },
  { pattern: "rabbitmq", type: "broker", label: "rabbitmq", role: "target" },
  { pattern: "kafka", type: "broker", label: "kafka", role: "target" },
  { pattern: "nats", type: "broker", label: "nats", role: "target" },
];

const PROXY_PATTERNS = ["nginx", "traefik", "haproxy", "caddy", "envoy"];

export function isInfraService(svc: Service): { type: string; label: string } | null {
  const img = svc.image.toLowerCase();
  const name = svc.name.toLowerCase();
  for (const p of INFRA_PATTERNS) {
    if (img.includes(p.pattern) || name.includes(p.pattern)) {
      return { type: p.type, label: p.label };
    }
  }
  return null;
}

export function isProxyService(svc: Service): boolean {
  const img = svc.image.toLowerCase();
  const name = svc.name.toLowerCase();
  return PROXY_PATTERNS.some((p) => img.includes(p) || name.includes(p));
}

export function isWorkerService(svc: Service): boolean {
  const name = svc.name.toLowerCase();
  return name.includes("celery") || name.includes("worker") || name.includes("beat") || name.includes("cron");
}

export async function discoverConnections(services: Service[]): Promise<Connection[]> {
  const connections: Connection[] = [];
  const seen = new Set<string>();

  // Separate services by role
  const infraServices = services.filter((s) => isInfraService(s));
  const proxyServices = services.filter((s) => isProxyService(s));
  const workerServices = services.filter((s) => isWorkerService(s));
  const appServices = services.filter(
    (s) => !isInfraService(s) && !isProxyService(s) && !isWorkerService(s)
  );

  function addConnection(from: string, to: string, type: string, label: string) {
    const key = `${from}:${to}`;
    if (seen.has(key) || from === to) return;
    seen.add(key);
    connections.push({ from, to, network: "", type, label });
  }

  // 1. App services → infra services (backend→db, backend→redis, etc.)
  for (const app of appServices) {
    // Each app connects to DB and cache in the same network
    for (const infra of infraServices) {
      const hasSharedNetwork = app.networks.some((n) => infra.networks.includes(n));
      if (!hasSharedNetwork) continue;
      const edge = isInfraService(infra)!;
      addConnection(app.uid, infra.uid, edge.type, edge.label);
    }
  }

  // 2. Workers → infra (celery→redis as broker, celery→db)
  for (const worker of workerServices) {
    for (const infra of infraServices) {
      const hasSharedNetwork = worker.networks.some((n) => infra.networks.includes(n));
      if (!hasSharedNetwork) continue;
      const edge = isInfraService(infra)!;
      const label = edge.type === "cache" ? "broker" : edge.label;
      addConnection(worker.uid, infra.uid, edge.type, label);
    }
  }

  // 3. Proxy → app services (nginx→backend, nginx→frontend, nginx→auth)
  for (const proxy of proxyServices) {
    for (const app of appServices) {
      const hasSharedNetwork = proxy.networks.some((n) => app.networks.includes(n));
      if (!hasSharedNetwork) continue;
      addConnection(proxy.uid, app.uid, "proxy", "upstream");
    }
  }

  // 4. Collector → infra (special: collector writes to db and redis)
  for (const svc of services) {
    if (svc.name.toLowerCase().includes("collector")) {
      for (const infra of infraServices) {
        const hasSharedNetwork = svc.networks.some((n) => infra.networks.includes(n));
        if (!hasSharedNetwork) continue;
        const edge = isInfraService(infra)!;
        addConnection(svc.uid, infra.uid, edge.type, edge.label);
      }
    }
  }

  return connections;
}

// ── Container logs ──

export async function getContainerLogs(id: string, tail = 200, since?: number): Promise<LogLine[]> {
  const container = docker.getContainer(id);
  const opts: Record<string, any> = {
    stdout: true,
    stderr: true,
    timestamps: true,
  };
  if (since) {
    // When filtering by time, use since only (no tail limit) — Docker applies tail before since
    opts.since = since;
  } else {
    opts.tail = tail;
  }
  const logBuffer = await container.logs(opts);

  const lines: LogLine[] = [];
  const raw = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(logBuffer as any);

  let offset = 0;
  while (offset < raw.length) {
    if (offset + 8 > raw.length) break;
    const streamType = raw[offset];
    const size = raw.readUInt32BE(offset + 4);
    if (offset + 8 + size > raw.length) break;

    const payload = raw.slice(offset + 8, offset + 8 + size).toString("utf-8").trimEnd();
    offset += 8 + size;

    if (!payload) continue;

    // Timestamp is at the start: "2024-01-01T00:00:00.000000000Z rest of line"
    const spaceIdx = payload.indexOf(" ");
    const timestamp = spaceIdx > 0 ? payload.slice(0, spaceIdx) : "";
    const line = spaceIdx > 0 ? payload.slice(spaceIdx + 1) : payload;

    lines.push({
      container: id,
      line,
      timestamp,
      stream: streamType === 2 ? "stderr" : "stdout",
    });
  }

  return lines;
}

export function streamContainerLogs(
  id: string,
  onLine: (line: LogLine) => void,
): { destroy: () => void } {
  const container = docker.getContainer(id);
  let stream: NodeJS.ReadableStream | null = null;
  let destroyed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const destroyStream = (s: unknown) => {
    if (s && typeof (s as any).destroy === "function") (s as any).destroy();
  };

  function connect() {
    if (destroyed) return;

    container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      since: Math.floor(Date.now() / 1000),
      timestamps: true,
    }).then((s) => {
      stream = s as unknown as NodeJS.ReadableStream;

      if (destroyed) {
        destroyStream(stream);
        stream = null;
        return;
      }

      // Docker multiplexed stream parsing for follow mode
      let buffer = Buffer.alloc(0);

      stream.on("data", (chunk: Buffer) => {
        if (destroyed) return;
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 8) {
          const streamType = buffer[0];
          const size = buffer.readUInt32BE(4);
          if (buffer.length < 8 + size) break;

          const payload = buffer.slice(8, 8 + size).toString("utf-8").trimEnd();
          buffer = buffer.slice(8 + size);

          if (!payload) continue;

          const spaceIdx = payload.indexOf(" ");
          const timestamp = spaceIdx > 0 ? payload.slice(0, spaceIdx) : "";
          const line = spaceIdx > 0 ? payload.slice(spaceIdx + 1) : payload;

          onLine({
            container: id,
            line,
            timestamp,
            stream: streamType === 2 ? "stderr" : "stdout",
          });
        }
      });

      // Auto-reconnect when stream closes (container stop/restart)
      stream.on("end", () => {
        stream = null;
        if (!destroyed) reconnectTimer = setTimeout(connect, 2000);
      });
      stream.on("error", () => {
        stream = null;
        if (!destroyed) reconnectTimer = setTimeout(connect, 2000);
      });
    }).catch(() => {
      if (!destroyed) reconnectTimer = setTimeout(connect, 2000);
    });
  }

  connect();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (stream) {
        destroyStream(stream);
        stream = null;
      }
    },
  };
}
