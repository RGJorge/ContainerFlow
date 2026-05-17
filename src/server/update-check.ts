import Docker from "dockerode";

const REPO = "RGJorge/ContainerFlow";
const REPO_URL = `https://github.com/${REPO}`;
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const REPO_INFO_URL = `https://api.github.com/repos/${REPO}`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export type DeployMode = "ghcr" | "source" | "unknown";

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** Number of stable releases between current and latest (e.g. 7 if you're on 0.1.0 and latest is 0.1.7). */
  releasesAhead: number;
  releaseUrl: string | null;
  repoUrl: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  deployMode: DeployMode;
  /** Current star count on the GitHub repo (null if fetch failed). */
  stars: number | null;
}

interface CacheEntry {
  data: UpdateInfo;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<UpdateInfo> | null = null;

function parseSemver(v: string): [number, number, number] | null {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!)];
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

async function detectDeployMode(): Promise<DeployMode> {
  try {
    const hostname = process.env.HOSTNAME;
    if (!hostname) return "unknown";
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    const container = await docker.getContainer(hostname).inspect();
    const image = container.Config?.Image || "";
    if (image.startsWith("ghcr.io/rgjorge/containerflow")) return "ghcr";
    if (image === "containerflow:local" || image.startsWith("containerflow:")) return "source";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// Pull the first ~6 highlight lines from release notes. Captures both
// bullet lists and ### / ## headings so any reasonable release format works.
function summarizeReleaseNotes(body: string | undefined | null): string | null {
  if (!body) return null;
  const SKIP_HEADINGS = /^(what'?s new|changelog|full changelog|notes|highlights)$/i;
  const lines = body.split(/\r?\n/);
  const bullets: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Bullet list items
    if (line.startsWith("- ") || line.startsWith("* ")) {
      bullets.push(stripMd(line.replace(/^[-*]\s+/, "")));
    }
    // Numbered list items
    else if (/^\d+\.\s/.test(line)) {
      bullets.push(stripMd(line.replace(/^\d+\.\s+/, "")));
    }
    // ## or ### headings (skip the generic "What's new" wrappers)
    else if (line.startsWith("### ") || line.startsWith("## ")) {
      const text = stripMd(line.replace(/^#+\s+/, ""));
      if (!SKIP_HEADINGS.test(text)) bullets.push(text);
    }
    if (bullets.length >= 15) break;
  }
  return bullets.length > 0 ? bullets.join("\n") : null;
}

function stripMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")            // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")      // bold
    .replace(/\*([^*]+)\*/g, "$1")          // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .trim();
}

function emptyInfo(currentVersion: string, deployMode: DeployMode, stars: number | null = null): UpdateInfo {
  return {
    current: currentVersion,
    latest: null,
    updateAvailable: false,
    releasesAhead: 0,
    releaseUrl: null,
    repoUrl: REPO_URL,
    releaseNotes: null,
    publishedAt: null,
    deployMode,
    stars,
  };
}

async function fetchStars(currentVersion: string): Promise<number | null> {
  try {
    const res = await fetch(REPO_INFO_URL, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `ContainerFlow/${currentVersion}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

async function fetchLatest(currentVersion: string): Promise<UpdateInfo> {
  const [deployMode, stars] = await Promise.all([detectDeployMode(), fetchStars(currentVersion)]);
  try {
    const res = await fetch(RELEASES_URL, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `ContainerFlow/${currentVersion}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return emptyInfo(currentVersion, deployMode, stars);

    const releases = (await res.json()) as Array<{
      tag_name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
      prerelease?: boolean;
      draft?: boolean;
    }>;
    if (!Array.isArray(releases) || releases.length === 0) {
      return emptyInfo(currentVersion, deployMode, stars);
    }

    // Stable releases only (no drafts, no prereleases). GitHub returns them
    // sorted newest first, which is what we want for `latest`.
    const stable = releases.filter((r) => !r.prerelease && !r.draft && r.tag_name);
    if (stable.length === 0) return emptyInfo(currentVersion, deployMode, stars);

    const latestRelease = stable[0]!;
    const latest = latestRelease.tag_name!.replace(/^v/, "");
    const updateAvailable = isNewer(latest, currentVersion);

    // How many stable releases are strictly newer than what the user is running?
    let releasesAhead = 0;
    if (updateAvailable) {
      for (const r of stable) {
        const v = r.tag_name!.replace(/^v/, "");
        if (isNewer(v, currentVersion)) releasesAhead++;
      }
    }

    return {
      current: currentVersion,
      latest,
      updateAvailable,
      releasesAhead,
      releaseUrl: latestRelease.html_url || `${REPO_URL}/releases/tag/${latestRelease.tag_name}`,
      repoUrl: REPO_URL,
      releaseNotes: summarizeReleaseNotes(latestRelease.body),
      publishedAt: latestRelease.published_at || null,
      deployMode,
      stars,
    };
  } catch {
    return emptyInfo(currentVersion, deployMode, stars);
  }
}

export async function getUpdateInfo(currentVersion: string): Promise<UpdateInfo> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;
  inFlight = fetchLatest(currentVersion)
    .then((data) => {
      cache = { data, fetchedAt: Date.now() };
      inFlight = null;
      return data;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}
