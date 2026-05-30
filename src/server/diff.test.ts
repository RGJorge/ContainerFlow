import { describe, test, expect } from "vitest";
import { computeGraphDiff, connectionKey } from "./diff";
import type { Service, Connection } from "../shared/types";

function svc(uid: string, overrides: Partial<Service> = {}): Service {
  return {
    id: uid,
    uid,
    name: uid.split("/")[1] ?? uid,
    image: "nginx:latest",
    state: "running",
    status: "Up 2 hours",
    ports: [],
    networks: ["bridge"],
    network_ips: {},
    project: uid.split("/")[0] ?? "proj",
    compose_file: "/app/docker-compose.yml",
    env: [],
    restart_policy: "unless-stopped",
    memory_limit: 0,
    cpu_quota: 0,
    health_status: "",
    health_log: [],
    exit_code: 0,
    restart_count: 0,
    oom_killed: false,
    mounts: [],
    ...overrides,
  };
}

function conn(from: string, to: string, network = "bridge"): Connection {
  return { from, to, network };
}

describe("computeGraphDiff", () => {
  test("no-op returns null", () => {
    const services = [svc("p/a"), svc("p/b")];
    const connections = [conn("p/a", "p/b")];
    expect(computeGraphDiff(services, services, connections, connections)).toBeNull();
  });

  test("add only", () => {
    const prev = [svc("p/a")];
    const next = [svc("p/a"), svc("p/b")];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff).not.toBeNull();
    expect(diff!.servicesAdded).toHaveLength(1);
    expect(diff!.servicesAdded![0].uid).toBe("p/b");
    expect(diff!.servicesRemoved).toBeUndefined();
    expect(diff!.servicesUpdated).toBeUndefined();
  });

  test("remove only", () => {
    const prev = [svc("p/a"), svc("p/b")];
    const next = [svc("p/a")];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff!.servicesRemoved).toEqual(["p/b"]);
    expect(diff!.servicesAdded).toBeUndefined();
  });

  test("update only — state change", () => {
    const prev = [svc("p/a", { state: "running" })];
    const next = [svc("p/a", { state: "exited", exit_code: 1 })];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff!.servicesUpdated).toHaveLength(1);
    expect(diff!.servicesUpdated![0].state).toBe("exited");
    expect(diff!.servicesAdded).toBeUndefined();
    expect(diff!.servicesRemoved).toBeUndefined();
  });

  test("update only — restart_count increment", () => {
    const prev = [svc("p/a", { restart_count: 0 })];
    const next = [svc("p/a", { restart_count: 1 })];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff!.servicesUpdated).toHaveLength(1);
  });

  test("status string change does NOT trigger update", () => {
    const prev = [svc("p/a", { status: "Up 1 minute" })];
    const next = [svc("p/a", { status: "Up 2 hours" })];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff).toBeNull();
  });

  test("health_log change does NOT trigger update", () => {
    const prev = [svc("p/a", { health_log: ["healthy at 10:00"] })];
    const next = [svc("p/a", { health_log: ["healthy at 11:00"] })];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff).toBeNull();
  });

  test("mixed: add + remove + update", () => {
    const prev = [svc("p/a"), svc("p/b"), svc("p/c")];
    const next = [svc("p/a", { state: "exited" }), svc("p/d")];
    const diff = computeGraphDiff(prev, next, [], []);
    expect(diff!.servicesAdded?.map((s) => s.uid)).toEqual(["p/d"]);
    expect(diff!.servicesRemoved?.sort()).toEqual(["p/b", "p/c"]);
    expect(diff!.servicesUpdated?.map((s) => s.uid)).toEqual(["p/a"]);
  });

  test("connection add only", () => {
    const svcs = [svc("p/a"), svc("p/b")];
    const diff = computeGraphDiff(svcs, svcs, [], [conn("p/a", "p/b")]);
    expect(diff!.connectionsAdded).toHaveLength(1);
    expect(diff!.connectionsRemoved).toBeUndefined();
  });

  test("connection remove only", () => {
    const svcs = [svc("p/a"), svc("p/b")];
    const diff = computeGraphDiff(svcs, svcs, [conn("p/a", "p/b")], []);
    expect(diff!.connectionsRemoved).toHaveLength(1);
    expect(diff!.connectionsRemoved![0]).toBe("p/a|p/b|bridge");
    expect(diff!.connectionsAdded).toBeUndefined();
  });

  test("connectionKey format", () => {
    expect(connectionKey(conn("p/a", "p/b", "mynet"))).toBe("p/a|p/b|mynet");
  });
});
