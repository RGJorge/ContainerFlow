import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const COLORS_FILE = path.join(DATA_DIR, ".dockerflow-project-colors.json");

export type ProjectColors = Record<string, string>;

export function loadProjectColors(): ProjectColors {
  try {
    if (fs.existsSync(COLORS_FILE)) {
      return JSON.parse(fs.readFileSync(COLORS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

export function saveProjectColors(colors: ProjectColors): void {
  fs.writeFileSync(COLORS_FILE, JSON.stringify(colors, null, 2));
}

// Accept #rrggbb (case-insensitive). Returns normalized "#rrggbb" or "" if invalid.
export function sanitizeColor(raw: string): string {
  const m = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return "";
  return "#" + m[1].toLowerCase();
}
