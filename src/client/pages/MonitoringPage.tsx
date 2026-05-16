import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Activity, Play, Square, RotateCcw, AlertTriangle, BarChart3, ChevronDown, Check, Maximize2, Minimize2, Settings } from "lucide-react";
import type { DockerEvent, StatsRange, Service, ContainerSettings, DiscordConfig, StatsHistoryPoint, EventLogEntry, NotificationLogEntry } from "../../shared/types";
import { useT } from "../i18n";
import { useAllStatsHistory, useStatsHistory } from "../hooks/useStatsHistory";
import { StatsCard } from "../components/StatsCard";
import { ThresholdBar } from "../components/ThresholdBar";
import { Tooltip } from "../components/Tooltip";
import { guessIcon } from "../nodes/ServiceNode";
import { getComposeKey } from "../engine/layout";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventIcon(action: string) {
  switch (action) {
    case "start":
      return <Play size={14} className="text-emerald-400" />;
    case "stop":
    case "die":
      return <Square size={14} className="text-red-400" />;
    case "restart":
      return <RotateCcw size={14} className="text-amber-400" />;
    default:
      return <AlertTriangle size={14} className="text-slate-400" />;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case "start": return "text-emerald-400";
    case "stop": case "die": return "text-red-400";
    case "restart": return "text-amber-400";
    default: return "text-slate-400";
  }
}

function ServiceIcon({ uid, services }: { uid: string; services: Service[] }) {
  const svc = services.find((s) => s.uid === uid);
  if (!svc) return null;
  const { Icon, color } = guessIcon(svc.image, svc.name);
  return (
    <div
      className="flex items-center justify-center w-6 h-6 rounded shrink-0"
      style={{ backgroundColor: `${color}22` }}
    >
      <Icon size={14} style={{ color }} />
    </div>
  );
}

function FilterDropdown({ label, open, onToggle, children, dropdownRef }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 border border-slate-700/50 px-3 py-1.5 rounded-md transition-colors"
      >
        <span className="text-slate-300 truncate max-w-[140px]">{label}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[220px] max-h-[320px] overflow-y-auto z-20">
          {children}
        </div>
      )}
    </div>
  );
}

interface MonitoringPageProps {
  events: DockerEvent[];
  token: string;
  services: Service[];
  eventLogStream: EventLogEntry[];
  notificationStream: NotificationLogEntry[];
  onOpenServiceDetail: (uid: string, tab?: "info" | "config" | "env" | "stats") => void;
  projectAliases?: Record<string, string>;
}

export function MonitoringPage({ events, token, services, eventLogStream, notificationStream, onOpenServiceDetail, projectAliases = {} }: MonitoringPageProps) {
  const { t } = useT();
  const [statsRange, setStatsRange] = useState<StatsRange>("1h");
  const [activeTab, setActiveTab] = useState<"history" | "events" | "notifications">("history");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [configService, setConfigService] = useState<string | null>(null);
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<HTMLDivElement>(null);
  const { data: allHistory, loading: historyLoading } = useAllStatsHistory(statsRange, token);
  const [containerSettings, setContainerSettings] = useState<Record<string, ContainerSettings>>({});
  const [globalThresholds, setGlobalThresholds] = useState<{ cpu: number; mem: number }>({ cpu: 50, mem: 60 });
  const [discordEnabled, setDiscordEnabled] = useState(false);

  // Load thresholds
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/container-settings", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, ContainerSettings>) => setContainerSettings(data))
      .catch(() => {});
    fetch("/api/discord-config", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data: DiscordConfig | null) => {
        if (data) {
          setGlobalThresholds({ cpu: data.thresholds.cpuPercent, mem: data.thresholds.memPercent });
          setDiscordEnabled(data.enabled && !!data.webhookUrl);
        }
      })
      .catch(() => {});
  }, [token]);

  // Save a single container's settings
  const saveContainerSetting = useCallback(async (uid: string, settings: ContainerSettings) => {
    setContainerSettings((prev) => ({ ...prev, [uid]: settings }));
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/container-settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({ uid, settings }),
      });
    } catch {}
  }, [token]);

  // Auto-save container settings on drag (debounced)
  const csSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((uid: string, settings: ContainerSettings) => {
    if (csSaveTimer.current) clearTimeout(csSaveTimer.current);
    csSaveTimer.current = setTimeout(() => {
      saveContainerSetting(uid, settings);
    }, 400);
  }, [saveContainerSetting]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as HTMLElement)) {
        setProjectFilterOpen(false);
      }
      if (serviceRef.current && !serviceRef.current.contains(e.target as HTMLElement)) {
        setServiceFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build all known services from services prop + events + history
  const allServiceNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of services) names.add(s.uid);
    for (const ev of events) names.add(ev.service);
    for (const svc of Object.keys(allHistory)) names.add(svc);
    return [...names].sort();
  }, [services, events, allHistory]);

  // Extract unique projects
  const allProjects = useMemo(() => {
    const projects = new Set<string>();
    for (const svc of allServiceNames) {
      const slash = svc.indexOf("/");
      projects.add(slash >= 0 ? svc.slice(0, slash) : "standalone");
    }
    return [...projects].sort();
  }, [allServiceNames]);

  // Services filtered by selected projects
  const projectFilteredServices = useMemo(() => {
    if (selectedProjects.size === 0) return allServiceNames;
    return allServiceNames.filter((svc) => {
      const slash = svc.indexOf("/");
      const project = slash >= 0 ? svc.slice(0, slash) : "standalone";
      return selectedProjects.has(project);
    });
  }, [allServiceNames, selectedProjects]);

  // Final filtered set (project filter + service filter)
  // When no service is explicitly selected, show nothing (require selection)
  const hasActiveFilter = selectedServices.size > 0 || selectedProjects.size > 0;
  const finalFilteredServices = useMemo(() => {
    if (selectedServices.size > 0) return new Set(projectFilteredServices.filter((svc) => selectedServices.has(svc)));
    if (selectedProjects.size > 0) return new Set(projectFilteredServices);
    return new Set<string>();
  }, [projectFilteredServices, selectedServices, selectedProjects]);

  // Filtered data
  const filteredHistory = useMemo(() => {
    const result: Record<string, typeof allHistory[string]> = {};
    for (const [svc, points] of Object.entries(allHistory)) {
      if (finalFilteredServices.has(svc)) result[svc] = points;
    }
    return result;
  }, [allHistory, finalFilteredServices]);

  const filteredEvents = useMemo(() => {
    const sorted = [...events].reverse();
    if (!hasActiveFilter) return sorted;
    return sorted.filter((ev) => finalFilteredServices.has(ev.service));
  }, [events, finalFilteredServices, hasActiveFilter]);

  const historyServiceNames = Object.keys(filteredHistory).sort();

  // Toggle helpers
  const toggleProject = (project: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  const toggleService = (svc: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(svc)) next.delete(svc);
      else next.add(svc);
      return next;
    });
  };

  // Labels
  const aliasOrName = (p: string) => projectAliases[p] || p;
  const projectLabel = selectedProjects.size === 0
    ? t("monitoring.filterProject")
    : selectedProjects.size === allProjects.length
      ? t("monitoring.allProjects")
      : selectedProjects.size === 1
        ? aliasOrName([...selectedProjects][0])
        : `${selectedProjects.size} ${t("filter.projects").toLowerCase()}`;

  const serviceLabel = selectedServices.size === 0
    ? t("monitoring.filterService")
    : selectedServices.size === projectFilteredServices.length
      ? t("monitoring.allServices")
      : selectedServices.size === 1
        ? ([...selectedServices][0].split("/").pop() || [...selectedServices][0])
        : `${selectedServices.size} ${t("footer.containers")}`;

  return (
    <div className="flex-1 min-h-0 mx-2 mt-1 mb-1 rounded-xl overflow-auto ring-1 ring-slate-700/60 p-6">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity size={24} className="text-cyan-400" />
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{t("monitoring.title")}</h1>
              <Tooltip text={t("monitoring.titleTooltip")} size={14} placement="right" nowrap />
            </div>
          </div>

          {/* Filters */}
          {allServiceNames.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Clear filters — only when something is active */}
              {(selectedProjects.size > 0 || selectedServices.size > 0) && (
                <button
                  onClick={() => {
                    setSelectedProjects(new Set());
                    setSelectedServices(new Set());
                  }}
                  className="text-slate-500 hover:text-slate-300 p-1.5 rounded-md hover:bg-slate-800/60 transition-colors"
                  title={t("monitoring.clearFilters")}
                >
                  <RotateCcw size={14} />
                </button>
              )}
              {/* Project filter */}
              {allProjects.length > 1 && (
                <FilterDropdown
                  label={projectLabel}
                  open={projectFilterOpen}
                  onToggle={() => { setProjectFilterOpen((v) => !v); setServiceFilterOpen(false); }}
                  dropdownRef={projectRef}
                >
                  <button
                    onClick={() => {
                      if (selectedProjects.size === allProjects.length) {
                        setSelectedProjects(new Set());
                      } else {
                        setSelectedProjects(new Set(allProjects));
                      }
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      selectedProjects.size === allProjects.length ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                    }`}>
                      {selectedProjects.size === allProjects.length && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-slate-300 font-medium">{t("monitoring.allProjects")}</span>
                  </button>
                  <div className="border-t border-slate-700/50 my-1" />
                  {allProjects.map((project) => {
                    const isSelected = selectedProjects.has(project);
                    const composeKeys = [...new Set(services.filter((s) => s.project === project).map((s) => getComposeKey(s.compose_file)))];
                    const composeSuffix = composeKeys.join(" - ");
                    return (
                      <button
                        key={project}
                        onClick={() => toggleProject(project)}
                        title={composeSuffix ? `${aliasOrName(project)} / ${composeSuffix}` : aliasOrName(project)}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <span className={`min-w-0 truncate uppercase ${isSelected ? "text-slate-200" : "text-slate-400"}`}>
                          {aliasOrName(project)}
                          {composeSuffix && <span className="ml-1 text-xs text-slate-500">/ {composeSuffix}</span>}
                        </span>
                      </button>
                    );
                  })}
                </FilterDropdown>
              )}

              {/* Service filter */}
              <FilterDropdown
                label={serviceLabel}
                open={serviceFilterOpen}
                onToggle={() => { setServiceFilterOpen((v) => !v); setProjectFilterOpen(false); }}
                dropdownRef={serviceRef}
              >
                <button
                  onClick={() => {
                    if (selectedServices.size === projectFilteredServices.length && projectFilteredServices.length > 0) {
                      setSelectedServices(new Set());
                    } else {
                      setSelectedServices(new Set(projectFilteredServices));
                    }
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selectedServices.size === projectFilteredServices.length ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                  }`}>
                    {selectedServices.size === projectFilteredServices.length && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-slate-300 font-medium">{t("monitoring.allServices")}</span>
                </button>
                <div className="border-t border-slate-700/50 my-1" />
                {projectFilteredServices.map((svc) => {
                  const shortName = svc.split("/").pop() || svc;
                  const isSelected = selectedServices.has(svc);
                  return (
                    <button
                      key={svc}
                      onClick={() => toggleService(svc)}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                      }`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <ServiceIcon uid={svc} services={services} />
                      <span className={isSelected ? "text-slate-200" : "text-slate-400"}>{shortName}</span>
                    </button>
                  );
                })}
              </FilterDropdown>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-700/40 mb-4">
          {([
            { key: "history" as const, label: t("monitoring.tabHistory") },
            { key: "events" as const, label: t("monitoring.tabEvents") },
            { key: "notifications" as const, label: t("monitoring.tabNotifications") },
          ]).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-sm font-medium relative transition-colors ${
                  isActive ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.label}
                <span className={`absolute bottom-0 left-0 right-0 h-px bg-cyan-400 transition-transform duration-300 ease-out origin-center ${isActive ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            );
          })}
        </div>

        {/* Resource Usage History */}
        {activeTab === "history" && (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-200">{t("monitoring.statsHistory")}</span>
            </div>
            <div className="flex gap-0.5">
              {(["1h", "6h", "24h", "7d"] as StatsRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setStatsRange(r)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    statsRange === r
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {!hasActiveFilter ? (
            <div className="px-6 py-10 text-center">
              <BarChart3 size={28} className="mx-auto mb-3 text-slate-600 opacity-50" />
              <p className="text-sm text-slate-500 mb-3">{t("monitoring.selectFilter")}</p>
              <button
                onClick={() => { setSelectedProjects(new Set(allProjects)); }}
                className="px-4 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-400 rounded-lg hover:bg-cyan-500/25 transition-colors"
              >
                {t("monitoring.loadAll")}
              </button>
            </div>
          ) : historyLoading ? (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              {t("monitoring.loadingHistory")}
            </div>
          ) : historyServiceNames.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              {t("monitoring.noHistoryData")}
            </div>
          ) : (
            <>
              <MonitoringTotalsCard
                historyByService={filteredHistory}
                services={services}
                filteredUids={finalFilteredServices}
                title={
                  selectedServices.size > 0
                    ? (selectedServices.size === 1
                        ? ([...selectedServices][0].split("/").pop() || [...selectedServices][0])
                        : `${selectedServices.size} ${t("footer.containers")}`)
                    : selectedProjects.size === 1
                      ? (() => {
                          const proj = [...selectedProjects][0];
                          const display = aliasOrName(proj);
                          const composeKeys = [...new Set(services.filter((s) => s.project === proj).map((s) => getComposeKey(s.compose_file)))];
                          const suffix = composeKeys.join(" - ");
                          return suffix ? `${display} / ${suffix.toUpperCase()}` : display;
                        })()
                      : selectedProjects.size === allProjects.length
                        ? t("monitoring.allProjects")
                        : `${selectedProjects.size} ${t("filter.projects").toLowerCase()}`
                }
              />
              <div className="divide-y divide-slate-700/40">
              {historyServiceNames.map((svc) => (
                <MonitoringServiceCard
                  key={svc}
                  svc={svc}
                  services={services}
                  containerSettings={containerSettings}
                  setContainerSettings={setContainerSettings}
                  globalThresholds={globalThresholds}
                  discordEnabled={discordEnabled}
                  configService={configService}
                  setConfigService={setConfigService}
                  expandedService={expandedService}
                  setExpandedService={setExpandedService}
                  saveContainerSetting={saveContainerSetting}
                  debouncedSave={debouncedSave}
                  globalRange={statsRange}
                  fallbackData={filteredHistory[svc] || []}
                  token={token}
                  projectAliases={projectAliases}
                />
              ))}
              </div>
            </>
          )}
        </div>
        )}

        {/* Events log (persistent, from SQLite) */}
        {activeTab === "events" && (
          <EventsLogTab
            token={token}
            services={services}
            liveStream={eventLogStream}
            filteredUids={finalFilteredServices}
            hasActiveFilter={hasActiveFilter}
            onOpenServiceDetail={onOpenServiceDetail}
          />
        )}

        {/* Notifications log (persistent, mirrors Discord) */}
        {activeTab === "notifications" && (
          <NotificationsLogTab
            token={token}
            services={services}
            liveStream={notificationStream}
            filteredUids={finalFilteredServices}
            hasActiveFilter={hasActiveFilter}
            onOpenServiceDetail={onOpenServiceDetail}
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Aggregated totals card — sum of CPU% and memory across all filtered services
// ──────────────────────────────────────────────────────────────────────────────

function MonitoringTotalsCard({
  historyByService,
  services,
  filteredUids,
  title,
}: {
  historyByService: Record<string, StatsHistoryPoint[]>;
  services: Service[];
  filteredUids: Set<string>;
  title: string;
}) {
  const { t } = useT();

  // Aggregate per-timestamp totals across all filtered services.
  // CPU: sum of per-container CPU% (can exceed 100% on multi-core hosts — informative).
  // MEM: sum of per-container mem_mb (absolute memory usage).
  const totals = useMemo(() => {
    const buckets = new Map<number, { cpu: number; mem_mb: number }>();
    for (const [svc, points] of Object.entries(historyByService)) {
      if (!filteredUids.has(svc)) continue;
      for (const p of points) {
        const existing = buckets.get(p.timestamp);
        if (existing) {
          existing.cpu += p.cpu;
          existing.mem_mb += p.mem_mb;
        } else {
          buckets.set(p.timestamp, { cpu: p.cpu, mem_mb: p.mem_mb });
        }
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ts, v]) => ({ timestamp: ts, cpu: v.cpu, mem_mb: v.mem_mb }));
  }, [historyByService, filteredUids]);

  // Sum container memory limits for the "X / Y" display
  const totalMemLimitMb = useMemo(() => {
    let sum = 0;
    for (const s of services) {
      if (!filteredUids.has(s.uid)) continue;
      if (s.memory_limit > 0) sum += s.memory_limit / 1024 / 1024;
    }
    return sum;
  }, [services, filteredUids]);

  // Hide totals card if it would be redundant with the single service card below
  if (totals.length === 0) return null;
  if (filteredUids.size <= 1) return null;

  const latest = totals[totals.length - 1];
  const cpuValue = `${latest.cpu.toFixed(1)}%`;
  const memValue = latest.mem_mb >= 1024
    ? `${(latest.mem_mb / 1024).toFixed(2)} GB`
    : `${latest.mem_mb.toFixed(0)} MB`;
  const memLimit = totalMemLimitMb > 0
    ? (totalMemLimitMb >= 1024 ? `${(totalMemLimitMb / 1024).toFixed(1)} GB` : `${totalMemLimitMb.toFixed(0)} MB`)
    : undefined;
  const formatMem = (v: number) => v >= 1024 ? `${(v / 1024).toFixed(2)} GB` : `${v.toFixed(0)} MB`;
  const containerCount = filteredUids.size;

  return (
    <div className="px-5 py-3 border-b border-slate-700/40 bg-slate-900/40">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-slate-300 font-medium truncate uppercase">{title}</span>
        <span className="text-[10px] text-slate-500">· {containerCount} {t("footer.containers")}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatsCard
          label={t("monitoring.totalCpu")}
          value={cpuValue}
          data={totals.map((p) => p.cpu)}
          timestamps={totals.map((p) => p.timestamp)}
          hoverValues={totals.map((p) => p.cpu)}
          color="#10b981"
          sparklineHeight={56}
          formatHoverValue={(v) => `${v.toFixed(1)}%`}
          showAverage
          formatAverage={(v) => `${v.toFixed(1)}%`}
          avgLabel={t("detail.avg")}
        />
        <StatsCard
          label={t("monitoring.totalMem")}
          value={memValue}
          limit={memLimit}
          data={totals.map((p) => p.mem_mb)}
          timestamps={totals.map((p) => p.timestamp)}
          hoverValues={totals.map((p) => p.mem_mb)}
          color="#10b981"
          sparklineHeight={56}
          formatHoverValue={formatMem}
          showAverage
          formatAverage={formatMem}
          avgLabel={t("detail.avg")}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-service card with its own range override
// ──────────────────────────────────────────────────────────────────────────────

interface MonitoringServiceCardProps {
  svc: string;
  services: Service[];
  containerSettings: Record<string, ContainerSettings>;
  setContainerSettings: React.Dispatch<React.SetStateAction<Record<string, ContainerSettings>>>;
  globalThresholds: { cpu: number; mem: number };
  discordEnabled: boolean;
  configService: string | null;
  setConfigService: React.Dispatch<React.SetStateAction<string | null>>;
  expandedService: string | null;
  setExpandedService: React.Dispatch<React.SetStateAction<string | null>>;
  saveContainerSetting: (uid: string, settings: ContainerSettings) => Promise<void>;
  debouncedSave: (uid: string, settings: ContainerSettings) => void;
  globalRange: StatsRange;
  fallbackData: StatsHistoryPoint[];
  token: string;
  projectAliases: Record<string, string>;
}

function MonitoringServiceCard({
  svc,
  services,
  containerSettings,
  setContainerSettings,
  globalThresholds,
  discordEnabled,
  configService,
  setConfigService,
  expandedService,
  setExpandedService,
  saveContainerSetting,
  debouncedSave,
  globalRange,
  fallbackData,
  token,
  projectAliases,
}: MonitoringServiceCardProps) {
  const { t } = useT();
  const [localRange, setLocalRange] = useState<StatsRange | null>(null);

  // When the global range changes, reset this card's local override so it
  // follows the new global. User clicking the global filter expresses intent
  // "show all at this range".
  useEffect(() => {
    setLocalRange(null);
  }, [globalRange]);

  const hasOverride = localRange !== null;
  const effectiveRange = localRange ?? globalRange;
  // Only fetch when overridden — otherwise the page's useAllStatsHistory covers it.
  const { data: ownData, loading: ownLoading } = useStatsHistory(svc, effectiveRange, token, hasOverride);

  const points = hasOverride ? ownData : fallbackData;
  const loading = hasOverride ? ownLoading : false;

  const shortName = svc.split("/").pop() || svc;
  const cs = containerSettings[svc];
  const svcNotifs = discordEnabled && (cs?.notificationsEnabled !== false);
  const cpuThreshold = svcNotifs ? (cs?.cpuThreshold ?? globalThresholds.cpu) : undefined;
  const memThreshold = svcNotifs ? (cs?.memThreshold ?? globalThresholds.mem) : undefined;
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const isExpanded = expandedService === svc;
  const chartHeight = isExpanded ? 120 : 56;
  const svcData = services.find((s) => s.uid === svc);
  const cpuLimit = svcData && svcData.cpu_quota > 0 ? `${(svcData.cpu_quota / 1000).toFixed(0)}%` : undefined;
  const memLimit = svcData && svcData.memory_limit > 0 ? `${(svcData.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined;

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-2 mb-2">
        <ServiceIcon uid={svc} services={services} />
        <div className="min-w-0">
          <span className="text-xs text-slate-300 font-medium truncate block">{shortName}</span>
          {svc.includes("/") && (() => {
            const proj = svc.split("/")[0];
            const display = projectAliases[proj] || proj;
            // Only show THIS service's compose (not the whole project's list).
            const thisCompose = svcData ? getComposeKey(svcData.compose_file) : "";
            return (
              <span className="text-[10px] text-slate-500 truncate block leading-tight uppercase">
                {display}{thisCompose && <span> / {thisCompose}</span>}
              </span>
            );
          })()}
        </div>
        <div className="flex-1" />
        {/* Per-card range buttons */}
        <div className="flex gap-0.5 mr-1">
          {(["1h", "6h", "24h", "7d"] as StatsRange[]).map((r) => {
            const active = effectiveRange === r;
            const isOverrideHighlight = active && hasOverride;
            return (
              <button
                key={r}
                onClick={() => setLocalRange(r === globalRange ? null : r)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  active
                    ? isOverrideHighlight
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                }`}
                title={isOverrideHighlight ? "Override (click on the matching global range to reset)" : undefined}
              >
                {r}
              </button>
            );
          })}
        </div>
        {discordEnabled && (
          <button
            onClick={() => {
              const opening = configService !== svc;
              setConfigService(opening ? svc : null);
              if (opening) setExpandedService(svc);
              else setExpandedService(null);
            }}
            className={`p-1 rounded hover:bg-slate-700/60 transition-colors ${configService === svc ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
            title={t("detail.config")}
          >
            <Settings size={14} />
          </button>
        )}
        <button
          onClick={() => setExpandedService(isExpanded ? null : svc)}
          className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 transition-colors"
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      {/* Inline config panel */}
      {configService === svc && (() => {
        const settings = cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
        const cpuTh = settings.cpuThreshold ?? globalThresholds.cpu;
        const memTh = settings.memThreshold ?? globalThresholds.mem;
        const cpuVal = latest?.cpu ?? 0;
        const memVal = latest?.mem_percent ?? 0;
        const memMb = latest?.mem_mb ?? 0;
        return (
          <div className="mb-2 bg-slate-900/90 border border-slate-700/40 rounded-lg px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">{t("detail.notifications")}</span>
              <button
                type="button"
                onClick={() => saveContainerSetting(svc, { ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                className={`relative w-9 h-5 rounded-full transition-colors ${settings.notificationsEnabled ? "bg-cyan-600" : "bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.notificationsEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {settings.notificationsEnabled && (
              <>
                <ThresholdBar
                  label={t("detail.cpuUsage")}
                  value={cpuVal}
                  threshold={cpuTh}
                  isCustom={settings.cpuThreshold !== null}
                  showThreshold={true}
                  thresholdLabel={t("detail.cpuThreshold")}
                  tagLabel={settings.cpuThreshold !== null ? t("detail.custom") : t("detail.global")}
                  hintLabel={t("detail.thresholdHint")}
                  onThresholdChange={(v) => {
                    setContainerSettings((prev) => {
                      const cur = prev[svc] || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
                      const updated = { ...cur, cpuThreshold: v };
                      debouncedSave(svc, updated);
                      return { ...prev, [svc]: updated };
                    });
                  }}
                  onReset={() => saveContainerSetting(svc, { ...(cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null }), cpuThreshold: null })}
                  formatValue={(v) => `${v.toFixed(1)}%`}
                  baseColor="cyan"
                />
                <ThresholdBar
                  label={t("detail.memoryUsage")}
                  value={memVal}
                  threshold={memTh}
                  isCustom={settings.memThreshold !== null}
                  showThreshold={true}
                  thresholdLabel={t("detail.memThreshold")}
                  tagLabel={settings.memThreshold !== null ? t("detail.custom") : t("detail.global")}
                  hintLabel={t("detail.thresholdHint")}
                  onThresholdChange={(v) => {
                    setContainerSettings((prev) => {
                      const cur = prev[svc] || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
                      const updated = { ...cur, memThreshold: v };
                      debouncedSave(svc, updated);
                      return { ...prev, [svc]: updated };
                    });
                  }}
                  onReset={() => saveContainerSetting(svc, { ...(cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null }), memThreshold: null })}
                  formatValue={() => `${memMb.toFixed(0)} MB (${memVal.toFixed(1)}%)`}
                  formatThreshold={svcData && svcData.memory_limit > 0 ? (th) => `${((th / 100) * svcData.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined}
                  baseColor="purple"
                />
              </>
            )}
          </div>
        );
      })()}
      {loading ? (
        <div className="text-slate-500 text-[11px] text-center py-4">{t("monitoring.loadingHistory")}</div>
      ) : (
        <div className={isExpanded ? "space-y-2" : "grid grid-cols-2 gap-2"}>
          <StatsCard
            label="CPU"
            value={latest ? `${latest.cpu.toFixed(1)}%` : "—"}
            limit={cpuLimit}
            data={points.map((p) => p.cpu)}
            timestamps={points.map((p) => p.timestamp)}
            hoverValues={points.map((p) => p.cpu)}
            color="#06b6d4"
            threshold={cpuThreshold}
            sparklineHeight={chartHeight}
            formatHoverValue={(v) => `${v.toFixed(2)}%`}
            showAverage
            formatAverage={(v) => `${v.toFixed(2)}%`}
            avgLabel={t("detail.avg")}
          />
          <StatsCard
            label="MEM"
            value={latest ? `${latest.mem_mb.toFixed(0)} MB` : "—"}
            limit={memLimit}
            data={points.map((p) => p.mem_percent)}
            timestamps={points.map((p) => p.timestamp)}
            hoverValues={points.map((p) => p.mem_mb)}
            color="#a78bfa"
            threshold={memThreshold}
            sparklineHeight={chartHeight}
            formatHoverValue={(v) => `${v.toFixed(0)} MB`}
            showAverage
            formatAverage={(v) => `${v.toFixed(0)} MB`}
            avgLabel={t("detail.avg")}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Events log tab — Docker events + UI actions, persistent in SQLite
// ──────────────────────────────────────────────────────────────────────────────

function EventsLogTab({ token, services, liveStream, filteredUids, hasActiveFilter, onOpenServiceDetail }: { token: string; services: Service[]; liveStream: EventLogEntry[]; filteredUids: Set<string>; hasActiveFilter: boolean; onOpenServiceDetail: (uid: string, tab?: "info" | "config" | "env" | "stats") => void }) {
  const { t } = useT();
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/events?limit=200", { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data: EventLogEntry[]) => { setEvents(data); setLoading(false); })
      .catch(() => { setEvents([]); setLoading(false); });
  }, [token]);

  // Merge live stream into events, dedupe by id, then apply monitoring filter
  const allEvents = useMemo(() => {
    const seen = new Set<number>();
    const merged: EventLogEntry[] = [];
    for (const e of [...liveStream, ...events]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (hasActiveFilter && !filteredUids.has(e.service)) continue;
      merged.push(e);
    }
    return merged;
  }, [events, liveStream, filteredUids, hasActiveFilter]);

  if (loading) {
    return <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-6 py-12 text-center text-slate-500">{t("monitoring.loadingHistory")}</div>;
  }

  if (allEvents.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-6 py-12 text-center text-slate-500">
        <Activity size={32} className="mx-auto mb-3 opacity-40" />
        <p>{t("monitoring.noEvents")}</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="divide-y divide-slate-700/40">
        {allEvents.map((ev) => {
          const isKnownService = services.some((svc) => svc.uid === ev.service);
          return (
          <div
            key={ev.id}
            onClick={isKnownService ? () => onOpenServiceDetail(ev.service, "stats") : undefined}
            className={`flex items-center gap-4 px-5 py-3 ${isKnownService ? "cursor-pointer hover:bg-slate-700/30" : ""} transition-colors`}
          >
            <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
              {eventIcon(ev.action)}
            </div>
            <ServiceIcon uid={ev.service} services={services} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm text-slate-200 font-medium truncate">
                  {ev.service.split("/").pop() || ev.service}
                </span>
                {ev.service.includes("/") && (
                  <span className="text-[10px] text-slate-500 truncate">
                    {ev.service.split("/")[0]}
                  </span>
                )}
                <span className={`text-[9px] uppercase font-medium px-1.5 py-0.5 rounded ${ev.source === "ui" ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-700/60 text-slate-400"}`}>
                  {ev.source}
                </span>
              </div>
              <span className={`text-xs font-mono ${actionColor(ev.action)}`}>{ev.action}</span>
              {ev.error_msg && (
                <pre className="mt-1 text-[10px] text-red-300 font-mono whitespace-pre-wrap break-words max-h-16 overflow-auto">{ev.error_msg}</pre>
              )}
            </div>
            <span className="text-xs text-slate-500 font-mono flex-shrink-0">{timeAgo(ev.timestamp)}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Notifications log tab — mirrors Discord webhooks, persistent in SQLite
// ──────────────────────────────────────────────────────────────────────────────

function levelStyles(level: NotificationLogEntry["level"]) {
  switch (level) {
    case "error": return { ring: "border-red-500/40", iconBg: "bg-red-500/20", iconColor: "text-red-400", titleColor: "text-red-300", dot: "bg-red-500", bar: "bg-red-500" };
    case "warning": return { ring: "border-amber-500/40", iconBg: "bg-amber-500/20", iconColor: "text-amber-400", titleColor: "text-amber-300", dot: "bg-amber-500", bar: "bg-amber-500" };
    case "info": return { ring: "border-cyan-500/40", iconBg: "bg-cyan-500/20", iconColor: "text-cyan-400", titleColor: "text-cyan-300", dot: "bg-cyan-500", bar: "bg-cyan-500" };
  }
}

function NotificationsLogTab({ token, services, liveStream, filteredUids, hasActiveFilter, onOpenServiceDetail }: { token: string; services: Service[]; liveStream: NotificationLogEntry[]; filteredUids: Set<string>; hasActiveFilter: boolean; onOpenServiceDetail: (uid: string, tab?: "info" | "config" | "env" | "stats") => void }) {
  const { t } = useT();
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/notifications?limit=100", { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data: NotificationLogEntry[]) => { setNotifications(data); setLoading(false); })
      .catch(() => { setNotifications([]); setLoading(false); });
  }, [token]);

  const allNotifs = useMemo(() => {
    const seen = new Set<number>();
    const merged: NotificationLogEntry[] = [];
    for (const n of [...liveStream, ...notifications]) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (hasActiveFilter && !filteredUids.has(n.service)) continue;
      merged.push(n);
    }
    return merged;
  }, [notifications, liveStream, filteredUids, hasActiveFilter]);

  if (loading) {
    return <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-6 py-12 text-center text-slate-500">{t("monitoring.loadingHistory")}</div>;
  }

  if (allNotifs.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-6 py-12 text-center text-slate-500">
        <AlertTriangle size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">{t("monitoring.noNotifications")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allNotifs.map((n) => {
        const s = levelStyles(n.level);
        const isKnownService = services.some((svc) => svc.uid === n.service);
        return (
          <div
            key={n.id}
            onClick={isKnownService ? () => onOpenServiceDetail(n.service, "stats") : undefined}
            className={`bg-slate-800/50 border ${s.ring} rounded-lg px-4 py-3 ${isKnownService ? "cursor-pointer hover:bg-slate-800/80 transition-colors" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
                <AlertTriangle size={14} className={s.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-semibold ${s.titleColor}`}>{n.title}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{n.type}</span>
                  <span className="flex-1" />
                  <span className="text-[10px] text-slate-500 font-mono">{timeAgo(n.timestamp)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ServiceIcon uid={n.service} services={services} />
                  <span className="text-xs text-slate-400 truncate">{n.service.split("/").pop() || n.service}</span>
                  {n.service.includes("/") && <span className="text-[10px] text-slate-500">· {n.service.split("/")[0]}</span>}
                </div>
                <pre className="mt-1.5 text-xs text-slate-300 font-mono whitespace-pre-wrap break-words leading-relaxed">{n.message}</pre>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
