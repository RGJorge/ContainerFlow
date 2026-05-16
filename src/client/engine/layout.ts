import type { Node, Edge } from "@xyflow/react";
import type { Service, Connection } from "../../shared/types";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 160;
const NODE_GAP_X = 36;
const NODE_GAP_Y = 36;
export const GROUP_PADDING = 28;
export const GROUP_HEADER = 44;
const GROUP_GAP = 50;

export function getComposeKey(file: string): string {
  if (!file) return "default";
  const match = file.match(/docker-compose\.?(.*)\.yml/);
  const key = match?.[1] || "";
  if (key === "") return "prod";
  return key.replace(/^\./, "");
}

function getGroupKey(service: Service): string {
  const compose = getComposeKey(service.compose_file);
  return `${service.project}/${compose}`;
}

function getGroupLabel(key: string): string {
  // "ninjasagacw/infra" → "NINJASAGACW / INFRA"
  const parts = key.split("/");
  return parts.map((p) => p.toUpperCase()).join(" / ");
}

// Color per group for visual distinction
const GROUP_COLORS: Record<string, string> = {
  infra: "rgba(239, 68, 68, 0.08)",
  dev: "rgba(59, 130, 246, 0.08)",
  prod: "rgba(34, 197, 94, 0.08)",
};

const GROUP_BORDER_COLORS: Record<string, string> = {
  infra: "rgba(239, 68, 68, 0.3)",
  dev: "rgba(59, 130, 246, 0.3)",
  prod: "rgba(34, 197, 94, 0.3)",
};

// Dynamic colors for project groups not matching known names
const DYNAMIC_COLORS = [
  { bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.3)" },
  { bg: "rgba(6, 182, 212, 0.08)", border: "rgba(6, 182, 212, 0.3)" },
  { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.3)" },
  { bg: "rgba(236, 72, 153, 0.08)", border: "rgba(236, 72, 153, 0.3)" },
  { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.3)" },
];
let dynamicIdx = 0;
const dynamicAssigned = new Map<string, (typeof DYNAMIC_COLORS)[0]>();

function getDynamicColor(key: string) {
  if (!dynamicAssigned.has(key)) {
    dynamicAssigned.set(key, DYNAMIC_COLORS[dynamicIdx % DYNAMIC_COLORS.length]!);
    dynamicIdx++;
  }
  return dynamicAssigned.get(key)!;
}

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function buildLayout(
  services: Service[],
  connections: Connection[]
): LayoutResult {
  if (services.length === 0) return { nodes: [], edges: [] };

  // Group services by project/compose_file (always consistent)
  const groups = new Map<string, Service[]>();
  for (const svc of services) {
    const key = getGroupKey(svc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(svc);
  }

  const nodes: Node[] = [];

  // Layout groups side by side
  const MAX_COLS_PER_GROUP = 3;
  let groupX = 0;
  let maxGroupHeight = 0;
  let groupRow = 0;
  const groupPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
  const groupEntries = Array.from(groups.entries());

  // Sort: infra groups first, then dev, then prod, then others
  const COMPOSE_ORDER = ["infra", "dev", "prod"];
  groupEntries.sort((a, b) => {
    // Sort by project first, then by compose key order
    const [projA, compA] = a[0].split("/");
    const [projB, compB] = b[0].split("/");
    if (projA !== projB) return projA.localeCompare(projB);
    const ai = COMPOSE_ORDER.indexOf(compA);
    const bi = COMPOSE_ORDER.indexOf(compB);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const [groupKey, svcs] of groupEntries) {
    const cols = Math.min(svcs.length, MAX_COLS_PER_GROUP);
    const rows = Math.ceil(svcs.length / cols);
    const contentWidth = cols * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X;
    const contentHeight = rows * (NODE_HEIGHT + NODE_GAP_Y) - NODE_GAP_Y;
    const groupWidth = Math.max(contentWidth + GROUP_PADDING * 2, NODE_WIDTH + GROUP_PADDING * 3);
    const groupHeight = contentHeight + GROUP_PADDING * 2 + GROUP_HEADER + GROUP_PADDING;

    groupPositions.set(groupKey, { x: groupX, y: 0, width: groupWidth, height: groupHeight });

    if (groupHeight > maxGroupHeight) maxGroupHeight = groupHeight;

    // Color based on compose part (infra/dev/prod), not full key
    const composePart = groupKey.split("/")[1] || groupKey;
    const knownBg = GROUP_COLORS[composePart];
    const knownBorder = GROUP_BORDER_COLORS[composePart];
    const dynamic = !knownBg ? getDynamicColor(groupKey) : null;
    const bgColor = knownBg || dynamic!.bg;
    const borderColor = knownBorder || dynamic!.border;

    // Compose file subtitle — show unique compose files in this group
    const composeFiles = [...new Set(svcs.map((s) => s.compose_file).filter(Boolean))]
      .map((f) => f.split("/").pop() || "")
      .filter(Boolean);
    const subtitle = composeFiles.join(", ");

    // Group node. `project` is the raw project key (without the compose part);
    // it's what the alias system uses so the same alias applies across all
    // compose files of the same project and matches the filter dropdown.
    nodes.push({
      id: `group-${groupKey}`,
      type: "group",
      position: { x: groupX, y: 0 },
      data: { label: getGroupLabel(groupKey), subtitle, count: svcs.length, project: svcs[0]?.project },
      style: {
        width: groupWidth,
        height: groupHeight,
        border: `1px dashed ${borderColor}`,
        borderRadius: 16,
        background: bgColor,
        padding: 0,
        fontSize: 13,
        fontWeight: 600,
        color: borderColor.replace("0.3", "0.8"),
      },
    });

    // Service nodes inside group (grid layout)
    svcs.forEach((svc, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = GROUP_PADDING + col * (NODE_WIDTH + NODE_GAP_X);
      const y = GROUP_HEADER + GROUP_PADDING + row * (NODE_HEIGHT + NODE_GAP_Y);

      nodes.push({
        id: svc.uid,
        type: "service",
        parentId: `group-${groupKey}`,
        position: { x, y },
        data: {
          ...svc,
          label: svc.name,
        },
      });
    });

    groupX += groupWidth + GROUP_GAP;
  }

  return { nodes, edges: [] };
}

// ── Recompute edges + activeHandles based on current node positions ──

const EDGE_COLORS: Record<string, string> = {
  database: "#336791",
  cache: "#F59E0B",
  broker: "#A855F7",
  proxy: "#22C55E",
};

export function computeEdges(
  currentNodes: Node[],
  connections: Connection[]
): { edges: Edge[]; activeHandles: Map<string, string[]> } {
  // Build absolute positions from current nodes
  const absPositions = new Map<string, { x: number; y: number }>();
  for (const n of currentNodes) {
    if (n.parentId) {
      const parent = currentNodes.find((p) => p.id === n.parentId);
      if (parent) {
        absPositions.set(n.id, {
          x: parent.position.x + n.position.x + NODE_WIDTH / 2,
          y: parent.position.y + n.position.y + NODE_HEIGHT / 2,
        });
      }
    }
  }

  function bestSide(fromId: string, toId: string): { sourceSide: string; targetSide: string } {
    const from = absPositions.get(fromId);
    const to = absPositions.get(toId);
    if (!from || !to) return { sourceSide: "bottom", targetSide: "top" };

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0
        ? { sourceSide: "right", targetSide: "left" }
        : { sourceSide: "left", targetSide: "right" };
    } else {
      return dy > 0
        ? { sourceSide: "bottom", targetSide: "top" }
        : { sourceSide: "top", targetSide: "bottom" };
    }
  }

  const nodeIds = new Set(currentNodes.map((n) => n.id));
  const validConnections = connections.filter((c) => nodeIds.has(c.from) && nodeIds.has(c.to));

  // Group ALL connections (source + target) by node+side so edges on the
  // same side never share the same handle slot, regardless of direction.
  interface SlotEntry { conn: Connection; nodeId: string; side: string; role: "source" | "target" }
  const nodeSlotGroups = new Map<string, SlotEntry[]>();

  for (const c of validConnections) {
    const { sourceSide, targetSide } = bestSide(c.from, c.to);

    // Both source and target go into the SAME group per node+side
    const srcKey = `${c.from}:${sourceSide}`;
    if (!nodeSlotGroups.has(srcKey)) nodeSlotGroups.set(srcKey, []);
    nodeSlotGroups.get(srcKey)!.push({ conn: c, nodeId: c.from, side: sourceSide, role: "source" });

    const tgtKey = `${c.to}:${targetSide}`;
    if (!nodeSlotGroups.has(tgtKey)) nodeSlotGroups.set(tgtKey, []);
    nodeSlotGroups.get(tgtKey)!.push({ conn: c, nodeId: c.to, side: targetSide, role: "target" });
  }

  // Sort each group by position of the other node so slots align spatially
  const assignedSlots = new Map<string, number>();

  for (const [groupKey, entries] of nodeSlotGroups) {
    const side = groupKey.split(":")[1]; // "left", "right", "top", "bottom"

    // For left/right sides, sort by Y of the other node (top→bottom = slot 0→2)
    // For top/bottom sides, sort by X of the other node (left→right = slot 0→2)
    entries.sort((a, b) => {
      const otherA = absPositions.get(a.role === "source" ? a.conn.to : a.conn.from);
      const otherB = absPositions.get(b.role === "source" ? b.conn.to : b.conn.from);
      if (!otherA || !otherB) return 0;
      if (side === "left" || side === "right") return otherA.y - otherB.y;
      return otherA.x - otherB.x;
    });

    // If only 1 edge on this side, use middle slot (1)
    // If 2, use slots 0 and 2. If 3, use 0, 1, 2
    const slotMap: number[][] = [
      [1],       // 1 edge → middle
      [0, 2],    // 2 edges → top/left and bottom/right
      [0, 1, 2], // 3 edges → all
    ];
    const slots = slotMap[Math.min(entries.length, 3) - 1];

    entries.forEach((entry, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const key = `${entry.conn.from}-${entry.conn.to}:${entry.nodeId}:${entry.role}`;
      assignedSlots.set(key, slot);
    });
  }

  // Build edges first, then compute corridor offsets
  interface EdgeInfo {
    conn: Connection;
    sourceSide: string;
    targetSide: string;
    srcSlot: number;
    tgtSlot: number;
  }

  const edgeInfos: EdgeInfo[] = validConnections.map((c) => {
    const { sourceSide, targetSide } = bestSide(c.from, c.to);
    const srcSlot = assignedSlots.get(`${c.from}-${c.to}:${c.from}:source`) ?? 1;
    const tgtSlot = assignedSlots.get(`${c.from}-${c.to}:${c.to}:target`) ?? 1;
    return { conn: c, sourceSide, targetSide, srcSlot, tgtSlot };
  });

  // Assign unique offsets per edge so smoothstep turns don't overlap
  // Each edge from same node+side gets a different turn distance
  const sideGroups = new Map<string, EdgeInfo[]>();
  for (const ei of edgeInfos) {
    const srcKey = `${ei.conn.from}:${ei.sourceSide}`;
    if (!sideGroups.has(srcKey)) sideGroups.set(srcKey, []);
    sideGroups.get(srcKey)!.push(ei);

    const tgtKey = `${ei.conn.to}:${ei.targetSide}`;
    if (!sideGroups.has(tgtKey)) sideGroups.set(tgtKey, []);
    sideGroups.get(tgtKey)!.push(ei);
  }

  const edgeOffsets = new Map<string, number>();
  const BASE_OFFSET = 10;
  const OFFSET_STEP = 15;

  for (const [, group] of sideGroups) {
    if (group.length <= 1) continue;
    group.forEach((ei, i) => {
      const eid = `${ei.conn.from}-${ei.conn.to}`;
      // Always positive: BASE + incremental step (never goes into node)
      const newOffset = BASE_OFFSET + i * OFFSET_STEP;
      const existing = edgeOffsets.get(eid);
      if (existing === undefined || newOffset > existing) {
        edgeOffsets.set(eid, newOffset);
      }
    });
  }

  const active = new Map<string, Set<string>>();
  const edges: Edge[] = edgeInfos.map((ei) => {
    const c = ei.conn;
    const color = EDGE_COLORS[c.type || ""] || "#475569";

    const sourceHandle = `${ei.sourceSide}-${ei.srcSlot}`;
    const targetHandle = `${ei.targetSide}-${ei.tgtSlot}-target`;

    if (!active.has(c.from)) active.set(c.from, new Set());
    if (!active.has(c.to)) active.set(c.to, new Set());
    active.get(c.from)!.add(sourceHandle);
    active.get(c.to)!.add(`${ei.targetSide}-${ei.tgtSlot}`);

    const offset = edgeOffsets.get(`${c.from}-${c.to}`) ?? 0;

    return {
      id: `${c.from}-${c.to}`,
      source: c.from,
      target: c.to,
      sourceHandle,
      targetHandle,
      label: c.label || "",
      type: "offsetSmooth",
      animated: false,
      data: { offset },
      style: { stroke: color, strokeWidth: 2, opacity: 0.7 },
      labelStyle: { fill: color, fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: "#0f172a", fillOpacity: 1 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  });

  const activeHandles = new Map<string, string[]>();
  for (const [id, set] of active) activeHandles.set(id, [...set]);

  return { edges, activeHandles };
}
