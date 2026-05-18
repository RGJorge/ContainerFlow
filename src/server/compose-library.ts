import fs from "fs";
import path from "path";
import { parse } from "yaml";
import type { ComposeLibraryService, ComposeLibraryStack, Service } from "../shared/types";

export const COMPOSE_FILENAMES = new Set([
  "compose.yml",
  "compose.yaml",
  "docker-compose.yml",
  "docker-compose.yaml",
]);

export function parseScanPaths(value = ""): string[] {
  return value
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p.replace(/\/+$/, "")));
}

export function findComposeFiles(scanPaths: string[]): string[] {
  const files: string[] = [];
  const seenDirs = new Set<string>();

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      const real = fs.realpathSync(dir);
      if (seenDirs.has(real)) return;
      seenDirs.add(real);
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();
      if (lowerName === "node_modules" || lowerName === ".git" || lowerName === "@recycle") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && COMPOSE_FILENAMES.has(entry.name)) {
        files.push(path.resolve(fullPath));
      }
    }
  }

  for (const scanPath of scanPaths) walk(scanPath);
  return [...new Set(files)].sort();
}

function normalizeConfigFiles(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => path.resolve(part));
}

function normalizeProfiles(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function imageFromDefinition(definition: unknown): string {
  if (!definition || typeof definition !== "object") return "";
  const image = (definition as any).image;
  return typeof image === "string" ? image : "";
}

export function deriveStackIdentity(composeFile: string, scanPaths: string[]): { project: string; variant: string } {
  const resolvedComposeFile = path.resolve(composeFile);
  const matchingRoot = scanPaths
    .map((p) => path.resolve(p))
    .sort((a, b) => b.length - a.length)
    .find((scanPath) => resolvedComposeFile === scanPath || resolvedComposeFile.startsWith(scanPath + path.sep));

  if (matchingRoot) {
    const relative = path.relative(matchingRoot, resolvedComposeFile);
    const segments = relative.split(path.sep).filter(Boolean);
    if (segments.length > 0) {
      const project = segments[0]!;
      const variant = segments.slice(1, -1).join(" / ");
      return { project, variant };
    }
  }

  return { project: path.basename(path.dirname(resolvedComposeFile)), variant: "" };
}

export function buildComposeLibrary(
  composeFiles: string[],
  services: Service[],
  isPathAllowed: (filePath: string) => boolean,
  scanPaths: string[] = [],
): ComposeLibraryStack[] {
  return composeFiles.map((composeFile) => buildStack(composeFile, services, isPathAllowed, scanPaths));
}

export function buildStack(
  composeFile: string,
  services: Service[],
  isPathAllowed: (filePath: string) => boolean,
  scanPaths: string[] = [],
): ComposeLibraryStack {
  const resolvedComposeFile = path.resolve(composeFile);
  const baseStack: ComposeLibraryStack = {
    host: "local",
    ...deriveStackIdentity(resolvedComposeFile, scanPaths),
    compose_file: resolvedComposeFile,
    locked: !isPathAllowed(resolvedComposeFile),
    services: [],
    counts: { running: 0, stopped: 0, not_created: 0, profiled: 0 },
  };

  let doc: any;
  try {
    doc = parse(fs.readFileSync(resolvedComposeFile, "utf-8"));
  } catch (err: any) {
    return { ...baseStack, error: err?.message || "Failed to parse compose file" };
  }

  const serviceDefs = doc?.services;
  if (!serviceDefs || typeof serviceDefs !== "object") {
    return { ...baseStack, error: "Compose file has no services section" };
  }

  const runtimeByService = new Map<string, Service>();
  for (const svc of services) {
    if (!svc.compose_file) continue;
    const configFiles = normalizeConfigFiles(svc.compose_file);
    if (!configFiles.includes(resolvedComposeFile)) continue;
    runtimeByService.set(svc.name, svc);
  }

  const libraryServices: ComposeLibraryService[] = Object.entries(serviceDefs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definition]) => {
      const runtime = runtimeByService.get(name);
      const profiles = normalizeProfiles((definition as any)?.profiles);
      const runtimeState = runtime
        ? runtime.state === "running" ? "running" : "stopped"
        : profiles.length > 0 ? "profiled" : "not_created";

      return {
        name,
        image: imageFromDefinition(definition),
        profiles,
        state: runtimeState,
        container_id: runtime?.id,
        container_uid: runtime?.uid,
      };
    });

  const counts = { running: 0, stopped: 0, not_created: 0, profiled: 0 };
  for (const svc of libraryServices) {
    counts[svc.state]++;
    if (svc.profiles.length > 0 && svc.state !== "profiled") counts.profiled++;
  }

  return {
    ...baseStack,
    services: libraryServices,
    counts,
  };
}
