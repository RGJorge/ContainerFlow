import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileStack, Layers, Lock, Play, RefreshCw, Search, X } from "lucide-react";
import type { ComposeLibraryStack, ComposeLibraryService } from "../../shared/types";

interface ComposeLibraryResponse {
  host: string;
  scanPaths: string[];
  stacks: ComposeLibraryStack[];
}

interface ComposeLibraryOverlayProps {
  token: string;
}

const stateClasses: Record<ComposeLibraryService["state"], string> = {
  running: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  stopped: "text-red-400 bg-red-500/10 border-red-500/30",
  not_created: "text-slate-400 bg-slate-700/30 border-slate-600/50",
  profiled: "text-amber-400 bg-amber-500/10 border-amber-500/30",
};

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
    if (open && !data && !loading) load();
  }, [open, data, loading, load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredStacks = useMemo(() => {
    const stacks = data?.stacks || [];
    const q = query.trim().toLowerCase();
    if (!q) return stacks;
    return stacks
      .map((stack) => {
        const stackMatch = stack.project.toLowerCase().includes(q) || stack.compose_file.toLowerCase().includes(q);
        const services = stackMatch
          ? stack.services
          : stack.services.filter((svc) => svc.name.toLowerCase().includes(q) || svc.image.toLowerCase().includes(q));
        return { ...stack, services };
      })
      .filter((stack) => stack.services.length > 0);
  }, [data, query]);

  const runAction = async (endpoint: string, body: Record<string, string>, busyKey: string) => {
    setBusyKey(busyKey);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      setTimeout(load, 800);
    } catch (err: any) {
      setError(err?.message || "Compose action failed");
    } finally {
      setBusyKey(null);
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
        <span className="hidden xl:inline text-xs">Library</span>
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
            <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/50 px-2.5 py-1.5">
              <Search size={14} className="text-slate-500 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stacks, paths, services, images"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
              />
            </div>
            {error && (
              <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
                {error}
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
            ) : filteredStacks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No stacks match the current search.</div>
            ) : (
              filteredStacks.map((stack) => {
                const stackBusy = busyKey === `${stack.compose_file}:stack`;
                return (
                  <div key={stack.compose_file} className="border-b border-slate-800 last:border-b-0">
                    <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {stack.locked ? <Lock size={13} className="text-slate-500" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
                          <span className="truncate text-sm font-semibold text-slate-100">{stack.project}</span>
                          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{stack.host}</span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={stack.compose_file}>{stack.compose_file}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="text-emerald-400">{stack.counts.running}</span>
                          <span>running</span>
                          <span className="text-slate-700">/</span>
                          <span>{stack.services.length}</span>
                        </div>
                        <button
                          onClick={() => runAction("/api/compose-library/up-stack", { host: stack.host, composeFile: stack.compose_file }, `${stack.compose_file}:stack`)}
                          disabled={stack.locked || !!stack.error || !!busyKey}
                          className="flex items-center gap-1.5 rounded bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          title={stack.locked ? "Outside ALLOWED_PATHS" : "docker compose up -d"}
                        >
                          {stackBusy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                          Up Stack
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
                            const serviceBusy = busyKey === key;
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
                                <button
                                  onClick={() => runAction("/api/compose-library/up-service", { host: stack.host, composeFile: stack.compose_file, service: svc.name }, key)}
                                  disabled={disabled}
                                  className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  title={svc.profiles.length > 0 ? "Profile selection is not available yet" : stack.locked ? "Outside ALLOWED_PATHS" : "docker compose up -d service"}
                                >
                                  {serviceBusy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                                  Up
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
