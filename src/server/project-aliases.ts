import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const ALIASES_FILE = path.join(DATA_DIR, ".dockerflow-project-aliases.json");

const MAX_ALIAS_LENGTH = 64;

export type ProjectAliases = Record<string, string>;

export function loadProjectAliases(): ProjectAliases {
  try {
    if (fs.existsSync(ALIASES_FILE)) {
      return JSON.parse(fs.readFileSync(ALIASES_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

export function saveProjectAliases(aliases: ProjectAliases): void {
  fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2));
}

export function sanitizeAlias(raw: string): string {
  return raw
    .replace(/[\x00-\x1f\x7f]/g, "") // strip control chars
    .trim()
    .slice(0, MAX_ALIAS_LENGTH);
}
