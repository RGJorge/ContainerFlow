export interface ContainerMount {
  /** "bind" = host directory · "volume" = named docker volume · "tmpfs" = in-memory */
  type: "bind" | "volume" | "tmpfs" | string;
  /** Path on the host (or volume backend path) */
  source: string;
  /** Path inside the container */
  destination: string;
  /** Volume name (only for type=volume) */
  name?: string;
  /** Volume driver (only for type=volume) */
  driver?: string;
  /** Mode string, e.g. "rw", "ro", "rprivate" */
  mode: string;
  /** true = read-write, false = read-only */
  rw: boolean;
}

export interface Service {
  id: string;
  uid: string;
  name: string;
  image: string;
  state: "running" | "exited" | "paused" | "restarting" | "dead" | "crashed";
  status: string;
  ports: { host: number; container: number }[];
  networks: string[];
  network_ips: Record<string, string>;
  project: string;
  compose_file: string;
  env: string[];
  restart_policy: string;
  memory_limit: number;
  cpu_quota: number;
  health_status: string;
  health_log: string[];
  exit_code: number;
  restart_count: number;
  oom_killed: boolean;
  mounts: ContainerMount[];
}

export interface Connection {
  from: string;
  to: string;
  network: string;
  type?: string;
  label?: string;
}

export interface Stats {
  service: string;
  cpu: number;
  /** Real memory usage in MB (usage minus reclaimable page cache).
   *  Matches what `docker stats` CLI shows. */
  mem_mb: number;
  /** Real memory usage as percentage of limit. */
  mem_percent: number;
  /** Optional breakdown for tooltips (only present in live stats, not persisted). */
  mem_breakdown?: {
    /** Anonymous memory (process heap, stack) in MB */
    anon_mb: number;
    /** Reclaimable page cache in MB (inactive_file) */
    cache_mb: number;
    /** Total reserved including cache (raw memory_stats.usage) in MB */
    total_mb: number;
    /** Container memory limit in MB */
    limit_mb: number;
  };
}

export interface DockerEvent {
  type: "docker";
  action: string;
  service: string;
  time: number;
}

export interface LogLine {
  container: string;
  line: string;
  timestamp: string;
  stream: "stdout" | "stderr";
}

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  events: {
    containerStateChanges: boolean;
    resourceAlerts: boolean;
    uiActions: boolean;
    actionErrors: boolean;
  };
  thresholds: {
    cpuPercent: number;
    memPercent: number;
  };
  cooldownMinutes: number;
  downReminderMinutes: number;
}

export interface ContainerSettings {
  /** false = no enviar notificaciones para este contenedor */
  notificationsEnabled: boolean;
  /** Override del umbral global de CPU (null = usar global) */
  cpuThreshold: number | null;
  /** Override del umbral global de memoria (null = usar global) */
  memThreshold: number | null;
}

export interface StatsHistoryPoint {
  timestamp: number;
  cpu: number;
  mem_mb: number;
  mem_percent: number;
}

export type StatsRange = "1h" | "6h" | "24h" | "7d";

export interface ActionError {
  id: string;
  uid: string;
  action: string;
  error: string;
  timestamp: number;
}

export interface ServerConfig {
  allowedPaths: string[];
  allowNonCompose: boolean;
  restrictedMode: boolean;
}

export type DeployMode = "ghcr" | "source" | "unknown";

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releasesAhead: number;
  releaseUrl: string | null;
  repoUrl: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  deployMode: DeployMode;
  stars: number | null;
}

export interface EventLogEntry {
  id: number;
  timestamp: number;
  service: string;
  action: string;
  source: "docker" | "ui";
  error_msg: string | null;
}

export interface NotificationLogEntry {
  id: number;
  timestamp: number;
  type: "state_change" | "resource_alert" | "ui_action" | "action_error";
  service: string;
  level: "info" | "warning" | "error";
  title: string;
  message: string;
}

export interface GraphDiff {
  servicesAdded?: Service[];
  servicesRemoved?: string[];      // uids
  servicesUpdated?: Service[];     // full object (includes uid)
  connectionsAdded?: Connection[];
  connectionsRemoved?: string[];   // "from|to|network" keys
}

export type WSMessage =
  | { type: "snapshot"; data: { services: Service[]; connections: Connection[] } }
  | { type: "diff"; data: GraphDiff }
  | { type: "stats"; data: Stats[] }
  | { type: "docker_event"; data: DockerEvent }
  | { type: "subscribe_logs"; container: string }
  | { type: "unsubscribe_logs" }
  | { type: "log_line"; data: LogLine }
  | { type: "action_error"; data: { uid: string; action: string; error: string } }
  | { type: "event_log"; data: EventLogEntry }
  | { type: "notification_log"; data: NotificationLogEntry };
