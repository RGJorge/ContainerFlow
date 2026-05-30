import type { Service, Connection, GraphDiff } from "../shared/types";

/** Stable fingerprint of a Service for change detection.
 *  Excludes `status` (verbose uptime string that changes every minute) and
 *  `health_log` (changes on every health-check interval). */
function serviceSignature(s: Service): string {
  return JSON.stringify([
    s.state, s.image, s.restart_count, s.health_status,
    s.exit_code, s.oom_killed, s.restart_policy, s.memory_limit, s.cpu_quota,
    s.ports, s.networks, s.network_ips, s.env, s.mounts, s.compose_file,
    s.name, s.project,
  ]);
}

export function connectionKey(c: Connection): string {
  return `${c.from}|${c.to}|${c.network}`;
}

/** Returns a GraphDiff between two graph states, or null when nothing changed. */
export function computeGraphDiff(
  prevServices: Service[],
  nextServices: Service[],
  prevConnections: Connection[],
  nextConnections: Connection[],
): GraphDiff | null {
  const prevSvcMap = new Map(prevServices.map((s) => [s.uid, s]));
  const nextSvcMap = new Map(nextServices.map((s) => [s.uid, s]));

  const servicesAdded = nextServices.filter((s) => !prevSvcMap.has(s.uid));
  const servicesRemoved = prevServices.filter((s) => !nextSvcMap.has(s.uid)).map((s) => s.uid);
  const servicesUpdated = nextServices.filter((s) => {
    const prev = prevSvcMap.get(s.uid);
    return prev !== undefined && serviceSignature(prev) !== serviceSignature(s);
  });

  const prevConnKeys = new Set(prevConnections.map(connectionKey));
  const nextConnKeys = new Set(nextConnections.map(connectionKey));
  const connectionsAdded = nextConnections.filter((c) => !prevConnKeys.has(connectionKey(c)));
  const connectionsRemoved = prevConnections.filter((c) => !nextConnKeys.has(connectionKey(c))).map(connectionKey);

  const hasChanges =
    servicesAdded.length > 0 || servicesRemoved.length > 0 || servicesUpdated.length > 0 ||
    connectionsAdded.length > 0 || connectionsRemoved.length > 0;

  if (!hasChanges) return null;

  const diff: GraphDiff = {};
  if (servicesAdded.length > 0) diff.servicesAdded = servicesAdded;
  if (servicesRemoved.length > 0) diff.servicesRemoved = servicesRemoved;
  if (servicesUpdated.length > 0) diff.servicesUpdated = servicesUpdated;
  if (connectionsAdded.length > 0) diff.connectionsAdded = connectionsAdded;
  if (connectionsRemoved.length > 0) diff.connectionsRemoved = connectionsRemoved;
  return diff;
}
