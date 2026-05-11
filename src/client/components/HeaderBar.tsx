import { useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut, Cpu, MemoryStick,
  LayoutDashboard, Activity, Settings, Bell,
  Play, Square, RotateCcw,
} from "lucide-react";
import type { Service, DockerEvent, NotificationLogEntry } from "../../shared/types";
import { useT } from "../i18n";

export type Page = "dashboard" | "monitoring" | "settings";

interface NavButtonProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavButton({ icon: Icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? "bg-slate-800 text-cyan-400"
          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
      }`}
    >
      <Icon size={18} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventIcon(action: string) {
  switch (action) {
    case "start": return <Play size={12} className="text-emerald-400" />;
    case "stop": case "die": return <Square size={12} className="text-red-400" />;
    case "restart": return <RotateCcw size={12} className="text-amber-400" />;
    default: return <Activity size={12} className="text-slate-400" />;
  }
}

interface NotificationBellProps {
  notifications: NotificationLogEntry[];
  services: Service[];
  token: string;
  onOpenServiceDetail: (uid: string, tab?: "info" | "config" | "env" | "stats") => void;
}

function levelDot(level: NotificationLogEntry["level"]): string {
  if (level === "error") return "bg-red-400";
  if (level === "warning") return "bg-amber-400";
  return "bg-cyan-400";
}

const LAST_READ_KEY = "df:lastReadNotifId";

function NotificationBell({ notifications, services, token, onOpenServiceDetail }: NotificationBellProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [persisted, setPersisted] = useState<NotificationLogEntry[]>([]);
  const [lastReadId, setLastReadId] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(LAST_READ_KEY) || "0") || 0; } catch { return 0; }
  });
  const ref = useRef<HTMLDivElement>(null);

  // Preload from server so the bell has history immediately after a page reload
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/notifications?limit=20", { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((d: NotificationLogEntry[]) => setPersisted(d))
      .catch(() => {});
  }, [token]);

  // Merge persisted + live, dedupe by id, keep newest 20
  const recent = useMemo(() => {
    const seen = new Set<number>();
    const merged: NotificationLogEntry[] = [];
    for (const n of [...notifications, ...persisted]) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      merged.push(n);
    }
    return merged.slice(0, 20);
  }, [notifications, persisted]);
  const unread = recent.filter((n) => n.id > lastReadId).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleToggle = () => {
    if (!open && recent.length > 0) {
      // Mark current set as read (persist)
      const newest = recent[0].id;
      setLastReadId(newest);
      try { localStorage.setItem(LAST_READ_KEY, String(newest)); } catch {}
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
        title={t("header.recentNotifications")}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-cyan-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 w-80 max-h-96 overflow-auto z-[9999]">
          <div className="px-3 py-2 border-b border-slate-700/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("header.recentNotifications")}
          </div>
          {recent.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500">{t("header.noNotifications")}</div>
          ) : (
            recent.map((n) => {
              const isKnownService = services.some((s) => s.uid === n.service);
              const isUnread = n.id > lastReadId;
              return (
                <div
                  key={n.id}
                  onClick={isKnownService ? () => { onOpenServiceDetail(n.service, "stats"); setOpen(false); } : undefined}
                  className={`flex items-start gap-2.5 px-3 py-2 ${isKnownService ? "cursor-pointer hover:bg-slate-700/40" : ""} transition-colors ${isUnread ? "" : "opacity-55"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${levelDot(n.level)} mt-1.5 shrink-0 ${isUnread ? "" : "ring-1 ring-slate-600 ring-offset-2 ring-offset-slate-800 opacity-70"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xs ${isUnread ? "text-slate-200 font-semibold" : "text-slate-300 font-normal"} truncate`}>{n.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate block">{n.service}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 mt-0.5">{timeAgo(n.timestamp)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface HeaderBarProps {
  services: Service[];
  filteredServices: Service[];
  token: string;
  totalStats: { cpu: number; mem: number };
  activePage: Page;
  onPageChange: (page: Page) => void;
  events: DockerEvent[];
  notifications: NotificationLogEntry[];
  onOpenServiceDetail: (uid: string, tab?: "info" | "config" | "env" | "stats") => void;
}

export function HeaderBar({
  services,
  filteredServices,
  token,
  totalStats,
  activePage,
  onPageChange,
  events,
  notifications,
  onOpenServiceDetail,
}: HeaderBarProps) {
  const { t, lang, setLang } = useT();

  return (
    <div className="flex items-center justify-between px-5 py-1 bg-slate-900/90 backdrop-blur-sm relative z-[9999]">
      {/* Left: Navigation */}
      <nav className="flex items-center gap-1">
        <NavButton icon={LayoutDashboard} label={t("header.dashboard")} active={activePage === "dashboard"} onClick={() => onPageChange("dashboard")} />
        <NavButton icon={Activity} label={t("header.monitoring")} active={activePage === "monitoring"} onClick={() => onPageChange("monitoring")} />
        <NavButton icon={Settings} label={t("header.settings")} active={activePage === "settings"} onClick={() => onPageChange("settings")} />
      </nav>

      {/* Center: Logo */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5">
        <img
          src="/alteonx-logo.webp"
          alt="ContainerFlow"
          className="w-7 h-7"
          style={{ filter: "brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2000%) hue-rotate(200deg) brightness(1.1)" }}
        />
        <div className="flex flex-col items-end">
          <span className="text-base font-bold text-white tracking-wide">ContainerFlow</span>
          <span className="text-[9px] text-slate-500 font-mono -mt-1">v{__APP_VERSION__}</span>
        </div>
      </div>

      {/* Right: contextual controls + notifications + logout */}
      <div className="flex items-center gap-4">
        {activePage === "dashboard" && (
          <>
            {/* Total resource usage */}
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <Cpu size={14} className="text-cyan-500" />
              <span className="text-cyan-400">{totalStats.cpu.toFixed(1)}%</span>
              <span className="text-slate-600">-</span>
              <MemoryStick size={14} className="text-violet-500" />
              <span className="text-violet-400">
                {totalStats.mem >= 1024 ? `${(totalStats.mem / 1024).toFixed(1)} GB` : `${totalStats.mem.toFixed(0)} MB`}
              </span>
            </div>

          </>
        )}

        {/* Language toggle */}
        <div className="flex items-center bg-slate-800 rounded-md border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => setLang("en")}
            className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
              lang === "en" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            EN
          </button>
          <div className="w-px h-4 bg-slate-700/50" />
          <button
            onClick={() => setLang("es")}
            className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
              lang === "es" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            ES
          </button>
        </div>

        <NotificationBell notifications={notifications} services={services} token={token} onOpenServiceDetail={onOpenServiceDetail} />

        {/* Logout (only if auth is active) */}
        {token && (
          <button
            onClick={() => { localStorage.removeItem("df:token"); window.location.reload(); }}
            className="flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
