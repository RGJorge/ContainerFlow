import { docker } from "./docker";
import type { Service, Stats, DockerEvent } from "../shared/types";

/** Compute real memory usage by subtracting reclaimable page cache.
 *  Works for cgroup v1 and v2.
 *
 *  Why: memory_stats.usage includes the kernel page cache — file-backed pages
 *  the kernel keeps in RAM after reading from disk. Both `active_file` and
 *  `inactive_file` are reclaimable under memory pressure (the kernel drops
 *  inactive first, then active when needed). They are NOT real container usage.
 *
 *  Note: `docker stats` CLI only subtracts `inactive_file`, which leaves the
 *  `active_file` portion looking like real usage. For DB containers (Postgres,
 *  MySQL, Mongo) most of their cached working set lives in `active_file`, so
 *  `docker stats` still over-reports. We subtract the full file cache for a
 *  more honest reading. The breakdown is exposed in mem_breakdown for users
 *  who want to see what's cache vs anon vs total.
 *
 *  Returns: { real, cache, anon, total, limit } all in bytes. */
export function computeMemoryBreakdown(memoryStats: any): {
  real: number;
  cache: number;
  anon: number;
  total: number;
  limit: number;
} {
  const total = memoryStats?.usage ?? 0;
  const limit = memoryStats?.limit ?? 0;
  const s = memoryStats?.stats ?? {};
  // Total reclaimable file-backed page cache (does NOT include shmem, which is
  // shared memory like Postgres shared_buffers — that IS real usage).
  // Prefer `active_file + inactive_file` (cgroup v2) over `file` because some
  // kernels include shmem in `file`, which would over-subtract.
  let cache = 0;
  if (typeof s.active_file === "number" || typeof s.inactive_file === "number") {
    // cgroup v2 — sum the two file-cache buckets
    cache = (s.active_file ?? 0) + (s.inactive_file ?? 0);
  } else if (typeof s.total_cache === "number") {
    // cgroup v1
    cache = s.total_cache;
  } else if (typeof s.cache === "number") {
    // cgroup v1 (older)
    cache = s.cache;
  } else if (typeof s.total_inactive_file === "number") {
    cache = s.total_inactive_file;
  } else if (typeof s.file === "number") {
    // Last-resort fallback (some kernels)
    cache = s.file;
  }
  // anon = process memory (heap, stack). cgroup v2: `anon`. cgroup v1: `rss` or `total_rss`.
  const anon = s.anon ?? s.total_rss ?? s.rss ?? 0;
  const real = Math.max(0, total - cache);
  return { real, cache, anon, total, limit };
}

export async function pollStats(services: Service[]): Promise<Stats[]> {
  const running = services.filter((s) => s.state === "running");

  // Poll all containers in parallel — sequential polling makes the first cycle
  // take ~3s × N containers, blocking the dashboard on page load. The Docker
  // daemon handles concurrent stats requests fine.
  const results = await Promise.all(running.map(async (svc): Promise<Stats | null> => {
    try {
      const container = docker.getContainer(svc.id);
      const raw = await Promise.race([
        container.stats({ stream: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]) as any;

      const cpuDelta =
        raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
      const sysDelta =
        raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;

      const onlineCpus = raw.cpu_stats.online_cpus || 1;
      const cpuHost =
        sysDelta > 0
          ? (cpuDelta / sysDelta) * onlineCpus * 100
          : 0;

      const cpu = svc.cpu_quota > 0
        ? (cpuHost * 100000 / svc.cpu_quota)
        : cpuHost;

      const mb = computeMemoryBreakdown(raw.memory_stats);
      const memLimit = mb.limit || 1;
      const TO_MB = 1024 * 1024;

      return {
        service: svc.uid,
        cpu: parseFloat(cpu.toFixed(2)),
        mem_mb: parseFloat((mb.real / TO_MB).toFixed(1)),
        mem_percent: parseFloat(((mb.real / memLimit) * 100).toFixed(1)),
        mem_breakdown: {
          anon_mb: parseFloat((mb.anon / TO_MB).toFixed(1)),
          cache_mb: parseFloat((mb.cache / TO_MB).toFixed(1)),
          total_mb: parseFloat((mb.total / TO_MB).toFixed(1)),
          limit_mb: parseFloat((mb.limit / TO_MB).toFixed(1)),
        },
      };
    } catch {
      // Container may have stopped between discovery and stats, or stats timed out
      return null;
    }
  }));

  return results.filter((r): r is Stats => r !== null);
}

export function watchDockerEvents(onEvent: (event: DockerEvent) => void) {
  docker.getEvents({}, (err, stream) => {
    if (err || !stream) {
      console.error("Failed to watch Docker events:", err);
      return;
    }

    let buffer = "";

    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          if (event.Type !== "container") continue;

          const action = event.Action?.split(":")[0]; // "health_status: healthy" → "health_status"
          if (!["start", "stop", "die", "restart", "destroy", "create", "health_status"].includes(action)) continue;

          const svcName =
            event.Actor?.Attributes?.["com.docker.compose.service"] ||
            event.Actor?.Attributes?.name ||
            "unknown";
          const svcProject =
            event.Actor?.Attributes?.["com.docker.compose.project"] ||
            "docker";
          onEvent({
            type: "docker",
            action,
            service: `${svcProject}/${svcName}`,
            time: event.time || Date.now() / 1000,
          });
        } catch {
          // Ignore malformed lines
        }
      }
    });
  });
}
