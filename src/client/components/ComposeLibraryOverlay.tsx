import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileStack, Layers, Lock, Play, RefreshCw, Search, Square, Trash2, X } from "lucide-react";
import type { ComposeLibraryStack, ComposeLibraryService } from "../../shared/types";

interface ComposeLibraryResponse {
  host: string;
  scanPaths: string[];
  stacks: ComposeLibraryStack[];
}

interface ComposeLibraryOverlayProps {
  token: string;
}

interface ComposeActionJob {
  id: string;
  action: string;
  uid: string;
  command: string[];
  status: "running" | "success" | "error";
  output: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
}

const stateClasses: Record<ComposeLibraryService["state"], string> = {
  running: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  stopped: "text-red-400 bg-red-500/10 border-red-500/30",
  not_created: "text-slate-400 bg-slate-700/30 border-slate-600/50",
  profiled: "text-amber-400 bg-amber-500/10 border-amber-500/30",
};

interface StackGroup {
  project: string;
  stacks: ComposeLibraryStack[];
  services: number;
  running: number;
}

function stateLabel(state: ComposeLibraryService["state"]): string {
  if (state === "not_created") return "Not Created";
  return state.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function ComposeLibraryOverlay({ token }: ComposeLibraryOverlayProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ComposeLibraryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionJob, setActionJob] = useState<ComposeActionJob | null>(null);
  const [successCloseIn, setSuccessCloseIn] = useState<number | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const actionLogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const headers = useCallback((json = false): Record<string, string> => {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/compose-library", { headers: headers() })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        setData(body);
      })
      .catch((err) => setError(err?.message || "Failed to load compose library"))
      .finally(() => setLoading(false));
  }, [headers]);

  useEffect(() => {
    if (data || loading) return;
    const runIdle = () => load();
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idleId = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(runIdle, { timeout: 5000 })
      : undefined;
    const timer = idleId === undefined ? window.setTimeout(runIdle, 3000) : undefined;

    return () => {
      if (idleId !== undefined && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [data, loading, load]);

  useEffect(() => {
    if (open && !data && !loading) load();
  }, [open, data, loading, load]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  const filteredStacks = useMemo(() => {
    const stacks = data?.stacks || [];
    const q = query.trim().toLowerCase();
    if (!q) return stacks;
    return stacks
      .map((stack) => {
        const stackMatch =
          stack.project.toLowerCase().includes(q) ||
          stack.variant.toLowerCase().includes(q) ||
          stack.compose_file.toLowerCase().includes(q);
        const services = stackMatch
          ? stack.services
          : stack.services.filter((svc) => svc.name.toLowerCase().includes(q) || svc.image.toLowerCase().includes(q));
        return { ...stack, services };
      })
      .filter((stack) => stack.services.length > 0);
  }, [data, query]);

  const stackGroups = useMemo(() => {
    const groups = new Map<string, StackGroup>();
    for (const stack of filteredStacks) {
      const existing = groups.get(stack.project) || { project: stack.project, stacks: [], services: 0, running: 0 };
      existing.stacks.push(stack);
      existing.services += stack.services.length;
      existing.running += stack.counts.running;
      groups.set(stack.project, existing);
    }
    return [...groups.values()].sort((a, b) => a.project.localeCompare(b.project));
  }, [filteredStacks]);

  useEffect(() => {
    if (expandedProjects.size === 0 && stackGroups.length > 0 && query.trim()) {
      setExpandedProjects(new Set(stackGroups.map((group) => group.project)));
    }
  }, [expandedProjects.size, stackGroups, query]);

  const toggleProject = (project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  useEffect(() => {
    if (!actionLogRef.current) return;
    actionLogRef.current.scrollTop = actionLogRef.current.scrollHeight;
  }, [actionJob?.output]);

  useEffect(() => {
    if (!actionJob) {
      setSuccessCloseIn(null);
      return;
    }
    if (actionJob.status !== "success") {
      setSuccessCloseIn(null);
      return;
    }

    setSuccessCloseIn(10);
    const interval = window.setInterval(() => {
      setSuccessCloseIn((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(interval);
          setActionJob(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [actionJob?.id, actionJob?.status]);

  const actionOutputLines = useMemo(() => {
    const output = actionJob?.output || "";
    const lines = output.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }, [actionJob?.output]);

  const pollJob = useCallback((jobId: string) => {
    fetch(`/api/compose-library/jobs/${jobId}`, { headers: headers() })
      .then(async (r) => {
        const payload = await r.json().catch(() => null);
        if (!r.ok) throw new Error(payload?.error || `HTTP ${r.status}`);
        setActionJob(payload);
        if (payload.status === "running") {
          setTimeout(() => pollJob(jobId), 1000);
        } else {
          setBusyKey(null);
          setTimeout(load, 800);
        }
      })
      .catch((err) => {
        setBusyKey(null);
        setError(err?.message || "Failed to read compose action output");
      });
  }, [headers, load]);

  const runAction = async (endpoint: string, body: Record<string, string>, busyKey: string, action: string) => {
    setBusyKey(busyKey);
    setError(null);
    setSuccessCloseIn(null);
    setActionJob({
      id: "",
      action,
      uid: busyKey,
      command: [],
      status: "running",
      output: "Starting compose action...\n",
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null,
    });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      if (payload?.jobId) pollJob(payload.jobId);
      else {
        setBusyKey(null);
        setTimeout(load, 800);
      }
    } catch (err: any) {
      setBusyKey(null);
      setError(err?.message || "Compose action failed");
    }
  };

  const totalServices = data?.stacks.reduce((sum, stack) => sum + stack.services.length, 0) || 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors"
        title="Compose Library"
      >
        <Layers size={16} />
        <span className="hidden xl:inline text-xs">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : "Library"}
        </span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[min(760px,calc(100vw-32px))] max-h-[78vh] overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 z-[9999]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileStack size={16} className="text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Compose Library</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {data ? `${data.stacks.length} stacks / ${totalServices} services` : "Scan configured compose paths"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-950/50 px-2.5 py-1.5">
                <Search size={14} className="text-slate-500 shrink-0" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search stacks, paths, services, images"
                  className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
                />
              </div>
              <button
                onClick={() => setExpandedProjects(new Set(stackGroups.map((group) => group.project)))}
                className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Expand all
              </button>
              <button
                onClick={() => setExpandedProjects(new Set())}
                className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Collapse all
              </button>
            </div>
            {error && (
              <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
                {error}
              </div>
            )}
            {actionJob && (
              <div className={`mt-2 overflow-hidden rounded border ${
                actionJob.status === "error"
                  ? "border-red-500/30 bg-red-500/10"
                  : actionJob.status === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-cyan-500/30 bg-cyan-500/10"
              }`}>
                <div className="flex items-center justify-between border-b border-slate-800/80 px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    {actionJob.status === "running" && <RefreshCw size={12} className="animate-spin text-cyan-300" />}
                    <span className="font-medium">{actionJob.action}</span>
                    <span className="text-slate-500">{actionJob.status}</span>
                    {actionJob.exitCode !== null && <span className="text-slate-500">exit {actionJob.exitCode}</span>}
                    {successCloseIn !== null && <span className="text-slate-500">closing in {successCloseIn}s</span>}
                  </div>
                  <button onClick={() => setActionJob(null)} className="text-slate-500 hover:text-slate-300" title="Close output">
                    <X size={12} />
                  </button>
                </div>
                <div ref={actionLogRef} className="max-h-32 overflow-y-auto px-3 py-3 font-mono text-[11px] space-y-0.5">
                  {actionOutputLines.length > 0 ? (
                    actionOutputLines.map((line, i) => (
                      <div
                        key={`${actionJob.id || "job"}:${i}`}
                        className={`${composeActionLineClass(line)} animate-[fadeIn_0.15s_ease-out]`}
                      >
                        {line}
                        {i === actionOutputLines.length - 1 && actionJob.status === "running" && (
                          <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">Waiting for output...</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="max-h-[58vh] overflow-y-auto">
            {loading && !data ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Loading compose library...</div>
            ) : !data || data.stacks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No compose files found. Set <span className="font-mono text-slate-400">COMPOSE_SCAN_PATHS</span> to enable the library.
              </div>
            ) : stackGroups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No stacks match the current search.</div>
            ) : (
              stackGroups.map((group) => (
                <div key={group.project} className="border-b border-slate-800 last:border-b-0">
                  <button
                    onClick={() => toggleProject(group.project)}
                    className="flex w-full items-center justify-between bg-slate-950/40 px-4 py-2.5 text-left hover:bg-slate-900/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${expandedProjects.has(group.project) ? "" : "-rotate-90"}`} />
                        <span className="truncate text-sm font-bold text-slate-100">{group.project}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {group.stacks.length} {group.stacks.length === 1 ? "variation" : "variations"} / {group.services} services
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="text-emerald-400">{group.running}</span>
                      <span>running</span>
                    </div>
                  </button>
                  {expandedProjects.has(group.project) && group.stacks.map((stack) => {
                    const title = stack.variant || stack.project;
                    const subtitle = stack.variant ? stack.compose_file : pathLabel(stack.compose_file);
                    return (
                      <div key={stack.compose_file} className="border-b border-slate-800 last:border-b-0">
                        <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {stack.locked ? <Lock size={13} className="text-slate-500" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
                              <span className="truncate text-sm font-semibold text-slate-100">{title}</span>
                              <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{stack.host}</span>
                            </div>
                            <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={stack.compose_file}>{subtitle}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span className="text-emerald-400">{stack.counts.running}</span>
                              <span>running</span>
                              <span className="text-slate-700">/</span>
                              <span>{stack.services.length}</span>
                            </div>
                            <button
                              onClick={() => runAction("/api/compose-library/up-stack", { host: stack.host, composeFile: stack.compose_file }, `${stack.compose_file}:up-stack`, "up-stack")}
                              disabled={stack.locked || !!stack.error || !!busyKey}
                              className="flex items-center justify-center rounded bg-cyan-500/15 p-1.5 text-cyan-300 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                              title={stack.locked ? "Outside ALLOWED_PATHS" : "docker compose up -d"}
                              aria-label={stack.locked ? "Outside ALLOWED_PATHS" : `Up stack ${title}`}
                            >
                              {busyKey === `${stack.compose_file}:up-stack` ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                            </button>
                            <button
                              onClick={() => runAction("/api/compose-library/stop-stack", { host: stack.host, composeFile: stack.compose_file }, `${stack.compose_file}:stop-stack`, "stop-stack")}
                              disabled={stack.locked || !!stack.error || !!busyKey}
                              className="flex items-center justify-center rounded bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                              title={stack.locked ? "Outside ALLOWED_PATHS" : "docker compose stop"}
                              aria-label={stack.locked ? "Outside ALLOWED_PATHS" : `Stop stack ${title}`}
                            >
                              {busyKey === `${stack.compose_file}:stop-stack` ? <RefreshCw size={12} className="animate-spin" /> : <Square size={11} />}
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Down stack "${title}"? This removes the compose containers and network.`)) {
                                  runAction("/api/compose-library/delete-stack", { host: stack.host, composeFile: stack.compose_file }, `${stack.compose_file}:delete-stack`, "delete-stack");
                                }
                              }}
                              disabled={stack.locked || !!stack.error || !!busyKey}
                              className="flex items-center justify-center rounded bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              title={stack.locked ? "Outside ALLOWED_PATHS" : "docker compose down --remove-orphans"}
                              aria-label={stack.locked ? "Outside ALLOWED_PATHS" : `Down stack ${title}`}
                            >
                              {busyKey === `${stack.compose_file}:delete-stack` ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={11} />}
                            </button>
                            <ChevronDown size={14} className="text-slate-600" />
                          </div>
                        </div>
                        {stack.error ? (
                          <div className="px-4 pb-3 text-xs text-red-300">{stack.error}</div>
                        ) : (
                          <div className="px-4 pb-3">
                              <div className="overflow-hidden rounded-md border border-slate-800">
                                {stack.services.map((svc) => {
                                  const key = `${stack.compose_file}:${svc.name}`;
                                  const canStop = svc.state === "running" && !!svc.container_id;
                                  const upBusy = busyKey === `${key}:up`;
                                  const stopBusy = busyKey === `${key}:stop`;
                                  const disabled = stack.locked || svc.profiles.length > 0 || !!busyKey;
                                  return (
                                    <div key={svc.name} className="grid grid-cols-[minmax(0,1fr)_120px_88px] items-center gap-3 border-b border-slate-800 bg-slate-950/30 px-3 py-2 last:border-b-0">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm text-slate-200">{svc.name}</div>
                                        <div className="truncate text-[11px] text-slate-500" title={svc.image || "No image tag"}>
                                          {svc.image || "No image tag"}
                                          {svc.profiles.length > 0 && <span className="ml-2 text-amber-400">profile: {svc.profiles.join(", ")}</span>}
                                        </div>
                                      </div>
                                      <span className={`justify-self-start rounded border px-2 py-1 text-[11px] ${stateClasses[svc.state]}`}>
                                        {stateLabel(svc.state)}
                                      </span>
                                      <div className="flex justify-self-end items-center gap-1.5">
                                        <button
                                          onClick={() => runAction("/api/compose-library/up-service", { host: stack.host, composeFile: stack.compose_file, service: svc.name }, `${key}:up`, "up-service")}
                                          disabled={disabled}
                                          className="flex items-center justify-center rounded bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                          title={svc.profiles.length > 0 ? "Profile selection is not available yet" : stack.locked ? "Outside ALLOWED_PATHS" : "docker compose up -d service"}
                                          aria-label={svc.profiles.length > 0 ? "Profile selection is not available yet" : stack.locked ? "Outside ALLOWED_PATHS" : `Up service ${svc.name}`}
                                        >
                                          {upBusy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (!svc.container_id) return;
                                            runAction(`/api/containers/${svc.container_id}/stop`, { host: stack.host, composeFile: stack.compose_file, service: svc.name }, `${key}:stop`, "stop");
                                          }}
                                          disabled={stack.locked || !canStop || !!busyKey}
                                          className="flex items-center justify-center rounded bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                          title={stack.locked ? "Outside ALLOWED_PATHS" : canStop ? "docker stop" : "Service is not running"}
                                          aria-label={stack.locked ? "Outside ALLOWED_PATHS" : `Stop service ${svc.name}`}
                                        >
                                          {stopBusy ? <RefreshCw size={12} className="animate-spin" /> : <Square size={11} />}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pathLabel(composeFile: string): string {
  const parts = composeFile.split("/");
  return parts.slice(-2).join("/");
}

const ERROR_PATTERN = /\b(error|fatal|critical|exception|traceback|panic|failed|segfault|denied|refused)\b/i;
const SUCCESS_PATTERN = /\b(ok|done|success|successful|started|starting|running|created|recreated|removed|up-to-date|completed|accepted|established)\b/i;
const WARN_PATTERN = /\b(warn|warning|skipped|deprecated)\b/i;

function composeActionLineClass(line: string): string {
  if (line.startsWith("$") || line.startsWith("[+]") || line.startsWith("=>")) return "text-cyan-400";
  if (ERROR_PATTERN.test(line)) return "text-red-400";
  if (WARN_PATTERN.test(line)) return "text-amber-400";
  if (SUCCESS_PATTERN.test(line)) return "text-emerald-400";
  return "text-slate-400";
}
