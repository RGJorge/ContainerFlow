import { useEffect, useRef, useState, useMemo, useCallback, useSyncExternalStore, startTransition } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ServiceNode } from "./nodes/ServiceNode";
import { GroupNode } from "./nodes/GroupNode";
import { useDocker } from "./hooks/useDocker";
import { useServerConfig } from "./hooks/useServerConfig";
import { I18nProvider, useT } from "./i18n";
import { createStatsStore, StatsStoreContext } from "./hooks/useStatsStore";
import { buildLayout, computeEdges, getComposeKey, NODE_WIDTH, NODE_HEIGHT, GROUP_PADDING, GROUP_HEADER } from "./engine/layout";
import { DetailPanel } from "./panels/DetailPanel";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { LoginScreen } from "./components/LoginScreen";
import { OffsetEdge } from "./components/OffsetEdge";
import { HeaderBar, type Page } from "./components/HeaderBar";
import { ExportPngButton } from "./components/ExportPngButton";
import { EdgeLegend } from "./components/EdgeLegend";
import { ActionErrorToast } from "./components/ActionErrorToast";
import { Wifi, WifiOff, ChevronDown, Check } from "lucide-react";
import { MonitoringPage } from "./pages/MonitoringPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { Service } from "../shared/types";

const nodeTypes = { service: ServiceNode, group: GroupNode };
const edgeTypes = { offsetSmooth: OffsetEdge };

function loadFilter(): Set<string> {
  try {
    const raw = localStorage.getItem("df:filter");
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function getToken(): string {
  return localStorage.getItem("df:token") || "";
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const saved = getToken();
    const headers: Record<string, string> = {};
    if (saved) headers["Authorization"] = `Bearer ${saved}`;

    fetch("/api/health", { headers }).then((r) => {
      if (r.ok) {
        setNeedsAuth(false);
        setAuthToken(saved || "");
      } else if (r.status === 401) {
        if (saved) localStorage.removeItem("df:token");
        setNeedsAuth(true);
      }
    }).catch(() => setNeedsAuth(false));
  }, []);

  if (needsAuth === null) return <div className="h-screen w-screen bg-slate-950" />;

  return (
    <I18nProvider>
      {needsAuth
        ? <LoginScreen onAuth={(tk) => { setAuthToken(tk); setNeedsAuth(false); }} />
        : <Dashboard token={authToken || ""} />}
    </I18nProvider>
  );
}

function Dashboard({ token }: { token: string }) {
  const { t } = useT();
  const statsStore = useMemo(() => createStatsStore(), []);
  const savedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const onPositions = useCallback((pos: Record<string, { x: number; y: number }>) => {
    savedPositions.current = pos;
  }, []);
  const { services, connections, stats, events, connected, logLines, sendMessage, clearLogLines, setProcessing, clearProcessing, getLogsSince, actionErrors, dismissActionError, clearActionErrors, pushActionError, eventLogStream, notificationStream } = useDocker(token, statsStore, onPositions);
  const { config: serverConfig, canInteract } = useServerConfig(token);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const initialLayoutDone = useRef(false);
  const PAGE_PATHS: Record<string, Page> = {
    "monitoreo": "monitoring", "monitoring": "monitoring",
    "configuracion": "settings", "settings": "settings",
  };
  const PAGE_SLUGS: Record<Page, string> = { dashboard: "", monitoring: "monitoreo", settings: "configuracion" };

  const getPageFromPath = (): Page => {
    const path = window.location.pathname.replace(/^\//, "");
    return PAGE_PATHS[path] || "dashboard";
  };
  const [activePage, setActivePage] = useState<Page>(getPageFromPath);

  // Sync URL with active page (browser back/forward)
  useEffect(() => {
    const handler = () => setActivePage(getPageFromPath());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const navigateTo = useCallback((page: Page) => {
    const slug = PAGE_SLUGS[page];
    window.history.pushState(null, "", slug ? `/${slug}` : "/");
    setActivePage(page);
  }, []);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(loadFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [openLogsFullscreen, setOpenLogsFullscreen] = useState(false);

  const [detailInitialTab, setDetailInitialTab] = useState<"info" | "config" | "env" | "stats" | undefined>(undefined);

  // Open the DetailPanel for a service by uid. Navigates to dashboard if needed.
  // Used from MonitoringPage notifications/events tabs (click → see container detail).
  const openServiceDetail = useCallback((uid: string, tab?: "info" | "config" | "env" | "stats") => {
    const svc = services.find((s) => s.uid === uid);
    if (!svc) return;
    setActivePage("dashboard");
    setSelectedNode(svc.uid);
    setDetailInitialTab(tab);
    setDetailService(svc);
  }, [services]);
  const reactFlowRef = useRef<any>(null);
  const prevViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const isDragging = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; service: Service } | null>(null);
  const [envFiles, setEnvFiles] = useState<Record<string, string>>({});

  // Thresholds (per-container settings + global Discord config). Used in
  // dashboard ServiceNode to color progress bars amber when exceeded.
  const [containerSettings, setContainerSettings] = useState<Record<string, { notificationsEnabled?: boolean; cpuThreshold?: number | null; memThreshold?: number | null }>>({});
  const [globalThresholds, setGlobalThresholds] = useState<{ cpu: number; mem: number }>({ cpu: 50, mem: 60 });
  const [discordEnabled, setDiscordEnabled] = useState(false);
  // Project aliases — friendly names for cryptic project keys (Coolify, Dokploy, etc.)
  const [projectAliases, setProjectAliases] = useState<Record<string, string>>({});
  // Save / reset handler — passed to GroupNode via node data. Wrapped in a ref
  // so the layout effect doesn't have to recompute every time the callback
  // identity changes; GroupNode always gets the latest version.
  const handleAliasChange = useCallback(async (project: string, newAlias: string) => {
    const trimmed = newAlias.trim();
    setProjectAliases((prev) => {
      const next = { ...prev };
      if (trimmed) next[project] = trimmed;
      else delete next[project];
      return next;
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      await fetch("/api/project-aliases", {
        method: "PUT",
        headers,
        body: JSON.stringify({ project, alias: trimmed }),
      });
    } catch {
      // On error, refetch from server to revert optimistic update.
      fetch("/api/project-aliases", { headers })
        .then((r) => r.ok ? r.json() : {})
        .then(setProjectAliases)
        .catch(() => {});
    }
  }, [token]);
  const handleAliasChangeRef = useRef(handleAliasChange);
  handleAliasChangeRef.current = handleAliasChange;
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/container-settings", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then(setContainerSettings)
      .catch(() => {});
    fetch("/api/project-aliases", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then(setProjectAliases)
      .catch(() => {});
    fetch("/api/discord-config", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((c: any) => {
        if (c) {
          setGlobalThresholds({ cpu: c.thresholds?.cpuPercent ?? 50, mem: c.thresholds?.memPercent ?? 60 });
          setDiscordEnabled(!!(c.enabled && c.webhookUrl));
        }
      })
      .catch(() => {});
  }, [token]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as HTMLElement)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch env-file overrides
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/env-files", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, string>) => setEnvFiles(data))
      .catch(() => {});
  }, [token]);

  const handleEnvFileChange = useCallback((composeFile: string, envFile: string | null) => {
    setEnvFiles((prev) => {
      const next = { ...prev };
      if (envFile) next[composeFile] = envFile;
      else delete next[composeFile];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/env-files", { method: "PUT", headers, body: JSON.stringify(next) }).catch(() => {});
      return next;
    });
  }, [token]);

  const NODE_W = NODE_WIDTH;
  const NODE_H = NODE_HEIGHT;
  const G_PAD = GROUP_PADDING;
  const MIN_X = G_PAD;
  const MIN_Y = GROUP_HEADER + G_PAD;

  // Close detail panel and restore viewport (with slide-out delay)
  const [panelClosing, setPanelClosing] = useState(false);
  const closeDetail = useCallback(() => {
    if (panelClosing) return;
    startTransition(() => {
      setPanelClosing(true);
      setSelectedNode(null);
    });
    if (prevViewport.current && reactFlowRef.current) {
      reactFlowRef.current.setViewport(prevViewport.current, { duration: 400 });
      prevViewport.current = null;
    }
    setTimeout(() => {
      startTransition(() => {
        setDetailService(null);
        setPanelClosing(false);
        setOpenLogsFullscreen(false);
      });
    }, 400);
  }, [panelClosing]);

  // Save positions (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savePositions = useCallback((nodes: Node[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        positions[n.id] = { x: n.position.x, y: n.position.y };
      }
      savedPositions.current = positions;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/positions", {
        method: "PUT",
        headers,
        body: JSON.stringify(positions),
      }).catch(() => {});
    }, 500);
  }, [token]);

  // Ref to hold the edge recomputation function (avoids circular deps with filteredConnections)
  const recomputeEdgesRef = useRef<(nodes: Node[]) => void>(() => {});

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes);

    const hasPositionChange = changes.some((c) => c.type === "position");
    if (!hasPositionChange) return;

    const isDragEnd = changes.some((c) => c.type === "position" && (c as any).dragging === false);

    // Skip expensive clamping/resizing during drag — only run on drag end
    if (!isDragEnd) return;

    setNodes((prev) => {
      let changed = false;
      const nodes = new Array<Node>(prev.length);
      for (let i = 0; i < prev.length; i++) nodes[i] = prev[i];

      // Clamp Y only
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.parentId) continue;
        const clampedY = Math.max(MIN_Y, n.position.y);
        if (clampedY !== n.position.y) {
          changed = true;
          nodes[i] = { ...n, position: { x: n.position.x, y: clampedY } };
        }
      }

      // Keep leftmost child at MIN_X — build parent→children index once
      const childrenByParent = new Map<string, number[]>();
      for (let i = 0; i < nodes.length; i++) {
        const pid = nodes[i].parentId;
        if (!pid) continue;
        let arr = childrenByParent.get(pid);
        if (!arr) { arr = []; childrenByParent.set(pid, arr); }
        arr.push(i);
      }

      for (const [gid, kidIdxs] of childrenByParent) {
        let minChildX = Infinity;
        for (const ki of kidIdxs) minChildX = Math.min(minChildX, nodes[ki].position.x);
        if (minChildX !== MIN_X) {
          const shift = minChildX - MIN_X;
          changed = true;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.id === gid) nodes[i] = { ...n, position: { x: n.position.x + shift, y: n.position.y } };
            else if (n.parentId === gid) nodes[i] = { ...n, position: { x: n.position.x - shift, y: n.position.y } };
          }
        }
      }

      // Resize groups to fit children
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.id.startsWith("group-")) continue;
        const kidIdxs = childrenByParent.get(n.id);
        if (!kidIdxs || kidIdxs.length === 0) continue;

        let maxRight = 0;
        let maxBottom = 0;
        for (const ki of kidIdxs) {
          const k = nodes[ki];
          maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
          maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
        }

        const minW = NODE_W + G_PAD * 3;
        const newW = Math.max(maxRight, minW);
        const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);

        const curW = (n.style?.width as number) || 0;
        const curH = (n.style?.height as number) || 0;

        if (newW !== curW || newH !== curH) {
          changed = true;
          nodes[i] = { ...n, style: { ...n.style, width: newW, height: newH } };
        }
      }

      savePositions(nodes);
      recomputeEdgesRef.current(nodes);
      return changed ? nodes : prev;
    });
  }, [onNodesChange, setNodes, savePositions]);

  const projects = useMemo(() => [...new Set(services.map((s) => s.project))].sort(), [services]);

  const toggleProject = (p: string) => {
    setHiddenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      localStorage.setItem("df:filter", JSON.stringify([...next]));
      return next;
    });
  };

  const filteredServices = useMemo(
    () => services.filter((s) => !hiddenProjects.has(s.project)),
    [services, hiddenProjects]
  );

  const filteredConnections = useMemo(
    () => {
      const uids = new Set(filteredServices.map((s) => s.uid));
      return connections.filter((c) => uids.has(c.from) && uids.has(c.to));
    },
    [connections, filteredServices]
  );

  // Build layout when data changes
  useEffect(() => {
    if (filteredServices.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: newNodes } = buildLayout(filteredServices, filteredConnections);

    // Mark service nodes as locked + inject effective thresholds for progress bar coloring.
    // For group nodes, inject the alias (if any) + the change handler.
    for (const n of newNodes) {
      if (n.type === "service") {
        const svc = filteredServices.find((s) => s.uid === n.id);
        if (svc) {
          (n.data as any).locked = !canInteract(svc);
          const cs = containerSettings[svc.uid];
          const notifsOn = discordEnabled && (cs?.notificationsEnabled !== false);
          (n.data as any).cpuThreshold = notifsOn ? (cs?.cpuThreshold ?? globalThresholds.cpu) : undefined;
          (n.data as any).memThreshold = notifsOn ? (cs?.memThreshold ?? globalThresholds.mem) : undefined;
        }
      } else if (n.type === "group") {
        // Use the raw `project` from the layout (NOT the groupKey which includes
        // the compose suffix). This way the alias matches what `service.project`
        // is on individual services, and the filter dropdown shares the same key.
        const project = (n.data as any).project as string | undefined;
        if (project) {
          (n.data as any).alias = projectAliases[project];
          (n.data as any).onAliasChange = handleAliasChangeRef.current;
        }
      }
    }

    if (!initialLayoutDone.current) {
      let positioned = newNodes.map((n) => {
        const saved = savedPositions.current[n.id];
        if (saved) return { ...n, position: saved };
        return n;
      });
      positioned = positioned.map((n) => {
        if (n.type !== "group") return n;
        const kids = positioned.filter((c) => c.parentId === n.id);
        if (kids.length === 0) return n;
        let maxRight = 0;
        let maxBottom = 0;
        for (const k of kids) {
          maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
          maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
        }
        const minW = NODE_W + G_PAD * 3;
        const newW = Math.max(maxRight, minW);
        const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);
        return { ...n, style: { ...n.style, width: newW, height: newH } };
      });
      const { edges, activeHandles } = computeEdges(positioned, filteredConnections);
      for (const n of positioned) {
        if (n.type === "service") {
          (n.data as any).activeHandles = activeHandles.get(n.id) || [];
        }
      }
      setNodes(positioned);
      setEdges(edges);
      initialLayoutDone.current = true;
    } else {
      setNodes((prev) => {
        const newNodeMap = new Map(newNodes.map((n) => [n.id, n]));
        const prevNodeMap = new Map(prev.map((n) => [n.id, n]));

        // 1. Update existing nodes (keep position, update data)
        const result: Node[] = [];
        for (const nn of newNodes) {
          const existing = prevNodeMap.get(nn.id);
          if (existing) {
            // Keep position and style, update data
            result.push({ ...existing, data: nn.data });
          } else {
            // New node — use saved position if available
            const saved = savedPositions.current[nn.id];
            result.push(saved ? { ...nn, position: saved } : nn);
          }
        }
        // Nodes in prev but NOT in newNodes are simply dropped (they disappeared)

        // 2. Resize groups to fit their children
        for (let i = 0; i < result.length; i++) {
          const n = result[i];
          if (n.type !== "group") continue;
          const kids = result.filter((c) => c.parentId === n.id);
          if (kids.length === 0) continue;
          let maxRight = 0;
          let maxBottom = 0;
          for (const k of kids) {
            maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
            maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
          }
          const minW = NODE_W + G_PAD * 3;
          const newW = Math.max(maxRight, minW);
          const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);
          result[i] = { ...n, style: { ...n.style, width: newW, height: newH } };
        }

        // 3. Recompute edges
        const { edges: updatedEdges, activeHandles } = computeEdges(result, filteredConnections);
        setEdges(updatedEdges);
        for (const n of result) {
          if (n.type === "service") {
            (n.data as any).activeHandles = activeHandles.get(n.id) || [];
          }
        }

        return result;
      });
    }
  }, [filteredServices, filteredConnections, canInteract, containerSettings, globalThresholds, discordEnabled, projectAliases]);

  // Recompute edges + handles on drag end (not every pixel)
  const recomputeEdges = useCallback((currentNodes: Node[]) => {
    if (currentNodes.length === 0 || filteredConnections.length === 0) return;
    const { edges: newEdges, activeHandles } = computeEdges(currentNodes, filteredConnections);
    setEdges(newEdges);
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "service") return n;
        const handles = activeHandles.get(n.id) || [];
        const current = (n.data as any).activeHandles || [];
        if (handles.length === current.length && handles.every((h: string, i: number) => h === current[i])) return n;
        return { ...n, data: { ...n.data, activeHandles: handles } };
      })
    );
  }, [filteredConnections, setEdges, setNodes]);
  recomputeEdgesRef.current = recomputeEdges;

  // Flash nodes on Docker events
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1]!;
    const flashClass =
      latest.action === "start" ? "flash-start" :
      latest.action === "die" || latest.action === "stop" ? "flash-stop" :
      latest.action === "restart" ? "flash-restart" : "";

    if (!flashClass) return;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === latest.service ? { ...n, data: { ...n.data, flash: flashClass } } : n
      )
    );

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === latest.service ? { ...n, data: { ...n.data, flash: "" } } : n
        )
      );
    }, 1200);
  }, [events]);

  // Total resource consumption (subscribes to all stats changes via the store directly)
  const allStats = useSyncExternalStore(
    useCallback((cb: () => void) => statsStore.subscribe(cb), [statsStore]),
    useCallback(() => statsStore.getSnapshot(), [statsStore])
  );
  const totalStats = useMemo(() => {
    let cpu = 0;
    let mem = 0;
    for (const svc of filteredServices) {
      const s = allStats.get(svc.uid);
      if (s) { cpu += s.cpu; mem += s.mem_mb; }
    }
    return { cpu, mem };
  }, [filteredServices, allStats]);

  // Pre-filter log lines for the detail panel to avoid passing the full array
  const panelLogLines = useMemo(
    () => detailService ? logLines.filter((l) => l.container === detailService.id) : [],
    [logLines, detailService]
  );

  // Dim nodes/edges when detail panel is open
  const dimmedNodes = useMemo(() => {
    if (!selectedNode) return nodes;
    return nodes.map((n) => {
      if (n.type !== "service") return n;
      const isSelected = n.id === selectedNode;
      if (isSelected) return n;
      return {
        ...n,
        style: { ...n.style, opacity: 0.25, transition: "opacity 0.4s ease" },
        data: { ...n.data, activeHandles: [] },
      };
    });
  }, [nodes, selectedNode]);

  const dimmedEdges = useMemo(() => {
    if (!selectedNode) return edges;
    return edges.map((e) => ({
      ...e,
      style: { ...e.style, opacity: 0.1, transition: "opacity 0.4s ease" },
      label: undefined,
      labelStyle: { opacity: 0 },
    }));
  }, [edges, selectedNode]);

  return (
    <StatsStoreContext.Provider value={statsStore}>
    <div className="h-screen w-screen bg-slate-900 flex flex-col">
      <HeaderBar
        services={services}
        filteredServices={filteredServices}
        token={token}
        totalStats={totalStats}
        activePage={activePage}
        onPageChange={(page) => { setContextMenu(null); navigateTo(page); }}
        events={events}
        notifications={notificationStream}
        onOpenServiceDetail={openServiceDetail}
      />

      <ActionErrorToast errors={actionErrors} onDismiss={dismissActionError} onClearAll={clearActionErrors} />

      {activePage === "monitoring" && <MonitoringPage events={events} token={token} services={services} eventLogStream={eventLogStream} notificationStream={notificationStream} onOpenServiceDetail={openServiceDetail} projectAliases={projectAliases} />}
      {activePage === "settings" && <SettingsPage projects={projects} servicesCount={services.length} token={token} />}

      {/* Canvas — inset (only visible on dashboard) */}
      <div id="dashboard-canvas" className={`flex-1 min-h-0 relative mx-2 mt-1 rounded-xl overflow-hidden ring-1 ring-slate-700/60 shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)] ${activePage !== "dashboard" ? "hidden" : ""}`}>
        <ReactFlow
          onInit={(instance) => { reactFlowRef.current = instance; }}
          nodes={dimmedNodes}
          edges={dimmedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={() => { isDragging.current = true; }}
          onNodeDragStop={() => { isDragging.current = false; }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            if (node.type !== "service") return;
            const svc = filteredServices.find((s) => s.uid === node.id);
            if (!svc) return;
            setContextMenu({ x: e.clientX, y: e.clientY, service: svc });
          }}
          onNodeClick={(_e, node) => {
            setContextMenu(null);
            if (isDragging.current) return;
            if (node.type !== "service") return;

            const svc = filteredServices.find((s) => s.uid === node.id);
            if (!svc) return;

            // Save current viewport before zooming
            if (reactFlowRef.current && !prevViewport.current) {
              prevViewport.current = reactFlowRef.current.getViewport();
            }

            // Compute absolute position (own position + parent group position)
            let absX = node.position.x;
            let absY = node.position.y;
            if (node.parentId) {
              const parent = nodes.find((n) => n.id === node.parentId);
              if (parent) {
                absX += parent.position.x;
                absY += parent.position.y;
              }
            }

            // Zoom to 1 and position node at ~75% from left (panel opens on left)
            const vw = window.innerWidth;
            const vh = window.innerHeight - 48; // subtract header height
            const zoom = 1.5;
            const targetX = vw * 0.75 - (absX + NODE_W / 2) * zoom;
            const targetY = vh * 0.5 - (absY + NODE_H / 2) * zoom;

            reactFlowRef.current?.setViewport({ x: targetX, y: targetY, zoom }, { duration: 400 });

            // Mark as non-urgent so the browser paints before React reconciles
            startTransition(() => {
              setSelectedNode(node.id);
              setDetailService(svc);
            });
          }}
          onMoveStart={() => { setContextMenu(null); }}
          onPaneClick={() => {
            setContextMenu(null);
            if (detailService) closeDetail();
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1}
          panOnScroll={true}
          translateExtent={[[-1000, -1000], [8000, 6000]]}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#374151" gap={30} size={2} />
          <Controls position="bottom-left">
            <ExportPngButton onError={(msg) => pushActionError("dashboard", "export", msg)} />
          </Controls>
          <EdgeLegend />
          <MiniMap
            position="bottom-right"
            nodeColor={(n) => {
              if (n.type === "group") return "#1e293b";
              const state = (n.data as any)?.state;
              if (state === "running") return "#22c55e80";
              if (state === "exited" || state === "dead") return "#ef444480";
              return "#f59e0b80";
            }}
            maskColor="rgba(15, 23, 42, 0.6)"
            style={{ background: "#0f172a" }}
          />
        </ReactFlow>

        {/* Project filter */}
        {projects.length > 1 && (
          <div data-no-export="true" className="absolute top-3 right-3 z-10" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 border border-slate-700/50 px-3 py-1.5 rounded-md transition-colors"
            >
              {t("filter.projects")}
              <span className="text-cyan-400 font-medium">
                {projects.length - hiddenProjects.size}/{projects.length}
              </span>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {filterOpen && (
              <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[280px] max-h-[280px] overflow-y-auto">
                {/* Select/Deselect all */}
                <button
                  onClick={() => {
                    const allVisible = hiddenProjects.size === 0;
                    setHiddenProjects(() => {
                      const next = allVisible ? new Set(projects) : new Set<string>();
                      localStorage.setItem("df:filter", JSON.stringify([...next]));
                      return next;
                    });
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    hiddenProjects.size === 0 ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                  }`}>
                    {hiddenProjects.size === 0 && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-slate-300 font-medium">{t("filter.all")}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs">
                    <span className="text-emerald-500/70">{services.filter((s) => s.state === "running").length}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-slate-400">{services.length}</span>
                  </span>
                </button>
                <div className="border-t border-slate-700/50 my-1" />
                {projects.map((p) => {
                  const active = !hiddenProjects.has(p);
                  const projectServices = services.filter((s) => s.project === p);
                  const running = projectServices.filter((s) => s.state === "running").length;
                  const stopped = projectServices.length - running;
                  const display = projectAliases[p] || p;
                  const composeKeys = [...new Set(projectServices.map((s) => getComposeKey(s.compose_file)))];
                  const composeSuffix = composeKeys.join(" - ");
                  return (
                    <button
                      key={p}
                      onClick={() => toggleProject(p)}
                      title={composeSuffix ? `${display} / ${composeSuffix}` : display}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        active ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                      }`}>
                        {active && <Check size={12} className="text-white" />}
                      </div>
                      <span className={`flex-1 min-w-0 truncate text-left uppercase ${active ? "text-slate-200" : "text-slate-500"}`}>
                        {display}
                        {composeSuffix && <span className="ml-1 text-xs text-slate-500">/ {composeSuffix}</span>}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs shrink-0">
                        <span className="text-emerald-500/70">{running}</span>
                        <span className="text-slate-600">/</span>
                        <span className="text-slate-400">{projectServices.length}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {contextMenu && (
          <NodeContextMenu
            position={{ x: contextMenu.x, y: contextMenu.y }}
            service={contextMenu.service}
            locked={!canInteract(contextMenu.service)}
            onClose={() => setContextMenu(null)}
            onAction={(action) => {
              const svc = contextMenu.service;
              // Optimistic processing — set BEFORE fetch
              const expectedState: Service["state"] =
                action === "stop" || action === "remove" ? "exited" :
                action === "start" || action === "restart" || action === "rebuild" || action === "recreate" ? "running" :
                svc.state;
              const minDuration = action === "restart" ? 2000 : (action === "rebuild" || action === "recreate") ? 3000 : 0;
              setProcessing(svc.uid, expectedState, minDuration);
              const headers: Record<string, string> = {};
              if (token) headers["Authorization"] = `Bearer ${token}`;
              fetch(`/api/containers/${svc.id}/${action}`, { method: "POST", headers })
                .then(async (r) => {
                  if (!r.ok) {
                    clearProcessing(svc.uid);
                    try {
                      const data = await r.json();
                      if (data?.error) pushActionError(svc.uid, action, data.error);
                    } catch {
                      pushActionError(svc.uid, action, `HTTP ${r.status}`);
                    }
                  }
                })
                .catch((err) => {
                  clearProcessing(svc.uid);
                  pushActionError(svc.uid, action, err?.message || "Network error");
                });
            }}
            onOpenLogs={() => {
              const svc = contextMenu.service;
              const node = nodes.find((n) => n.id === svc.uid);
              if (!node) return;

              if (reactFlowRef.current && !prevViewport.current) {
                prevViewport.current = reactFlowRef.current.getViewport();
              }

              let absX = node.position.x;
              let absY = node.position.y;
              if (node.parentId) {
                const parent = nodes.find((n) => n.id === node.parentId);
                if (parent) { absX += parent.position.x; absY += parent.position.y; }
              }

              const vw = window.innerWidth;
              const vh = window.innerHeight - 48;
              const zoom = 1.5;
              const targetX = vw * 0.75 - (absX + NODE_W / 2) * zoom;
              const targetY = vh * 0.5 - (absY + NODE_H / 2) * zoom;
              reactFlowRef.current?.setViewport({ x: targetX, y: targetY, zoom }, { duration: 400 });

              startTransition(() => {
                setOpenLogsFullscreen(true);
                setSelectedNode(svc.uid);
                setDetailService(svc);
              });
            }}
          />
        )}

        {detailService && (
          <DetailPanel
            service={filteredServices.find((s) => s.uid === detailService.uid) || detailService}
            stats={stats.get(detailService.uid)}
            logLines={panelLogLines}
            token={token}
            closing={panelClosing}
            locked={!canInteract(detailService)}
            onClose={closeDetail}
            onAction={setProcessing}
            clearProcessing={clearProcessing}
            pushActionError={pushActionError}
            sendMessage={sendMessage}
            clearLogLines={clearLogLines}
            connections={filteredConnections}
            services={filteredServices}
            getLogsSince={getLogsSince}
            initialLogsFullscreen={openLogsFullscreen}
            initialTab={detailInitialTab}
            envFiles={envFiles}
            onEnvFileChange={handleEnvFileChange}
            events={events}
            onContainerSettingsChange={(uid, settings) => setContainerSettings((prev) => ({ ...prev, [uid]: settings }))}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-5 py-1.5 text-xs text-slate-600 font-mono relative z-[9999]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi size={12} className="text-emerald-500" />
            ) : (
              <WifiOff size={12} className="text-red-500" />
            )}
            <span className={connected ? "text-emerald-500" : "text-red-500"}>
              {connected ? t("footer.live") : t("footer.offline")}
            </span>
          </div>
          <span>
            <span className="text-emerald-400">{filteredServices.filter((s) => s.state === "running").length}</span>
            <span>/{filteredServices.length} {t("footer.containers")}</span>
          </span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
          <span>{services.length} {t("footer.containers")}</span>
          <span>{projects.length} {t("footer.projects")}</span>
        </div>

        <span>AlteonX</span>
      </footer>
    </div>
    </StatsStoreContext.Provider>
  );
}
