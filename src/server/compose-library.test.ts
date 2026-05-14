import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildComposeLibrary, buildStack, findComposeFiles, parseScanPaths } from "./compose-library";
import type { Service } from "../shared/types";

const tmpDirs: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "containerflow-compose-"));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeSvc(overrides: Partial<Service> = {}): Service {
  return {
    id: "abc123",
    uid: "proj/svc",
    name: "svc",
    image: "node:20",
    state: "running",
    status: "Up 5 minutes",
    ports: [],
    networks: ["default"],
    network_ips: {},
    project: "proj",
    compose_file: "",
    env: [],
    restart_policy: "",
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

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseScanPaths", () => {
  it("parses colon-separated scan paths", () => {
    expect(parseScanPaths(" /srv/apps:/opt/stacks/ ")).toEqual([
      path.resolve("/srv/apps"),
      path.resolve("/opt/stacks"),
    ]);
  });
});

describe("findComposeFiles", () => {
  it("finds supported compose filenames recursively", () => {
    const root = tmpRoot();
    const appCompose = path.join(root, "app", "compose.yml");
    const dbCompose = path.join(root, "db", "docker-compose.yaml");
    writeFile(appCompose, "services: {}\n");
    writeFile(dbCompose, "services: {}\n");
    writeFile(path.join(root, "notes.yml"), "services: {}\n");

    expect(findComposeFiles([root])).toEqual([appCompose, dbCompose].sort());
  });
});

describe("buildStack", () => {
  it("extracts compose services and top-level project name", () => {
    const root = tmpRoot();
    const composeFile = path.join(root, "media", "compose.yml");
    writeFile(composeFile, `
name: media-prod
services:
  api:
    image: example/api:latest
  worker:
    image: example/worker:latest
`);

    const stack = buildStack(composeFile, [], () => true);
    expect(stack.project).toBe("media-prod");
    expect(stack.services.map((s) => s.name)).toEqual(["api", "worker"]);
    expect(stack.services[0].image).toBe("example/api:latest");
    expect(stack.counts.not_created).toBe(2);
  });

  it("matches runtime containers by compose file and service label data", () => {
    const root = tmpRoot();
    const composeFile = path.join(root, "app", "compose.yml");
    writeFile(composeFile, `
services:
  api:
    image: example/api:latest
  db:
    image: postgres:16
`);

    const stack = buildStack(composeFile, [
      makeSvc({ name: "api", uid: "app/api", id: "abc123", state: "running", compose_file: composeFile }),
      makeSvc({ name: "db", uid: "app/db", id: "def456", state: "exited", compose_file: `${composeFile},/other.yml` }),
    ], () => true);

    expect(stack.services.find((s) => s.name === "api")).toMatchObject({
      state: "running",
      container_id: "abc123",
      container_uid: "app/api",
    });
    expect(stack.services.find((s) => s.name === "db")).toMatchObject({
      state: "stopped",
      container_id: "def456",
      container_uid: "app/db",
    });
  });

  it("marks services with profiles as profiled when no container exists", () => {
    const root = tmpRoot();
    const composeFile = path.join(root, "tools", "docker-compose.yml");
    writeFile(composeFile, `
services:
  debug:
    image: alpine
    profiles: ["debug"]
`);

    const stack = buildStack(composeFile, [], () => true);
    expect(stack.services[0]).toMatchObject({
      name: "debug",
      profiles: ["debug"],
      state: "profiled",
    });
    expect(stack.counts.profiled).toBe(1);
  });

  it("returns an error entry for invalid yaml", () => {
    const root = tmpRoot();
    const composeFile = path.join(root, "bad", "compose.yml");
    writeFile(composeFile, "services:\n  api: [\n");

    const stack = buildStack(composeFile, [], () => true);
    expect(stack.error).toBeTruthy();
    expect(stack.services).toEqual([]);
  });
});

describe("buildComposeLibrary", () => {
  it("marks stacks as locked when path is not allowed", () => {
    const root = tmpRoot();
    const composeFile = path.join(root, "app", "compose.yml");
    writeFile(composeFile, "services:\n  api:\n    image: node:20\n");

    const [stack] = buildComposeLibrary([composeFile], [], () => false);
    expect(stack.locked).toBe(true);
  });
});
