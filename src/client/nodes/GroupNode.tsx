import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeProps } from "@xyflow/react";
import { Server, Wrench, Rocket, Box, Folder, Container, Pencil, RotateCcw, Check, X, Palette } from "lucide-react";
import { useT } from "../i18n";

interface GroupNodeData {
  label: string;
  subtitle?: string;
  count?: number;
  /** Original (raw) project key used to look up / save the alias. */
  project?: string;
  /** Current alias if set, else undefined / empty string. */
  alias?: string;
  /** Current custom hex color (e.g. "#3b82f6"), if any. */
  color?: string;
  /** Save handler — called with (project, newAlias). Empty newAlias = reset. */
  onAliasChange?: (project: string, newAlias: string) => void;
  /** Color change handler — empty color = reset to default palette. */
  onColorChange?: (project: string, color: string) => void;
  [key: string]: unknown;
}

// Palette shown when user clicks the color dot. First entry resets to default.
const COLOR_PALETTE: { hex: string; name: string }[] = [
  { hex: "#3b82f6", name: "blue" },
  { hex: "#8b5cf6", name: "purple" },
  { hex: "#06b6d4", name: "cyan" },
  { hex: "#22c55e", name: "green" },
  { hex: "#f59e0b", name: "yellow" },
  { hex: "#ef4444", name: "red" },
];

const groupConfig: Record<string, { icon: typeof Server; color: string; borderColor: string }> = {
  INFRA: { icon: Server, color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" },
  DEV: { icon: Wrench, color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.3)" },
  PROD: { icon: Rocket, color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.3)" },
};

// Rotating colors for project-based groups that don't match known names
const projectColors = [
  { color: "#8b5cf6", borderColor: "rgba(139, 92, 246, 0.3)" },
  { color: "#06b6d4", borderColor: "rgba(6, 182, 212, 0.3)" },
  { color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" },
  { color: "#ec4899", borderColor: "rgba(236, 72, 153, 0.3)" },
  { color: "#10b981", borderColor: "rgba(16, 185, 129, 0.3)" },
];

let colorIndex = 0;
const assignedColors = new Map<string, (typeof projectColors)[0]>();

function getProjectColor(label: string) {
  if (!assignedColors.has(label)) {
    assignedColors.set(label, projectColors[colorIndex % projectColors.length]!);
    colorIndex++;
  }
  return assignedColors.get(label)!;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const GroupNode = memo(function GroupNode({ data }: NodeProps) {
  const { t } = useT();
  const d = data as unknown as GroupNodeData;
  // Label is "PROJECT / COMPOSE" (uppercase). We let users alias only the
  // project portion — the compose suffix (DEV / PROD / INFRA / docker-compose
  // file name) stays as a structural hint and is also used for the icon match.
  const labelParts = d.label.split(" / ");
  const projectPart = labelParts[0] || d.label;
  const composePart = labelParts.length > 1 ? labelParts.slice(1).join(" / ") : "";
  // Standalone containers (no compose) are grouped under project="docker" with
  // compose key "default". For those, drop the suffix from the title and use a
  // distinct icon so the group reads as "containers running directly on docker".
  const isStandalone = d.project === "docker";
  const iconKey = composePart || d.label;
  const known = groupConfig[iconKey];
  const proj = known ? null : getProjectColor(d.label);
  const baseConfig = isStandalone
    ? { icon: Container, color: "#94a3b8", borderColor: "rgba(148, 163, 184, 0.3)" }
    : known || { icon: Folder, color: proj!.color, borderColor: proj!.borderColor };
  // Override the color when the user has picked a custom one for this project.
  const config = d.color
    ? { icon: baseConfig.icon, color: d.color, borderColor: hexToRgba(d.color, 0.3) }
    : baseConfig;
  const Icon = config.icon;

  const hasAlias = Boolean(d.alias && d.alias.trim().length > 0);
  const projectDisplay = hasAlias ? d.alias! : projectPart;
  const displayName = composePart && !isStandalone ? `${projectDisplay} / ${composePart}` : projectDisplay;
  const canEdit = Boolean(d.project && d.onAliasChange);
  const canColor = Boolean(d.project && d.onColorChange);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectDisplay);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Color palette popover
  const colorBtnRef = useRef<HTMLButtonElement | null>(null);
  const [palettePos, setPalettePos] = useState<{ left: number; top: number } | null>(null);
  const openPalette = () => {
    const el = colorBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPalettePos({ left: rect.left + rect.width / 2, top: rect.bottom + 6 });
  };
  const closePalette = () => setPalettePos(null);
  const pickColor = (hex: string) => {
    if (!d.project) return;
    d.onColorChange?.(d.project, hex);
    closePalette();
  };
  // Close palette on outside click / Esc / wheel (zoom) / canvas pan.
  // Palette uses fixed positioning so it'd visually detach from the button on
  // pan/zoom — close instead of trying to follow. Use capture phase + pointer
  // events because React Flow's pan handlers stop mousedown propagation.
  useEffect(() => {
    if (!palettePos) return;
    const onDown = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-color-palette]") || t.closest("[data-color-btn]")) return;
      closePalette();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePalette(); };
    const onWheel = () => closePalette();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("resize", closePalette);
    window.addEventListener("blur", closePalette);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", onWheel, { capture: true } as any);
      window.removeEventListener("resize", closePalette);
      window.removeEventListener("blur", closePalette);
    };
  }, [palettePos]);

  // Footer tooltip: only show when text is actually clipped (`...`).
  const footerRef = useRef<HTMLSpanElement | null>(null);
  const [footerTip, setFooterTip] = useState<{ left: number; top: number } | null>(null);

  const onFooterEnter = () => {
    const el = footerRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const rect = el.getBoundingClientRect();
    setFooterTip({ left: rect.left + rect.width / 2, top: rect.top - 6 });
  };
  const onFooterLeave = () => setFooterTip(null);

  // Shared tooltip state for header buttons (pencil / reset / color / save / cancel).
  // Uses the same visual style as the Tooltip component (slate-700 bg, slate-600 border).
  const [btnTip, setBtnTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const showBtnTip = (e: React.MouseEvent<HTMLElement>, text: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBtnTip({ text, left: rect.left + rect.width / 2, top: rect.top - 8 });
  };
  const hideBtnTip = () => setBtnTip(null);

  // Focus input when entering edit mode. Cursor lands at the end of the
  // current draft — no selection highlight, so users can just type to append.
  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  // Keep draft in sync if alias changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(projectDisplay);
  }, [projectDisplay, editing]);

  const startEdit = () => {
    if (!canEdit) return;
    // Short names (≤25 chars) → prefill so user can tweak (e.g. add a suffix).
    // Long names (cryptic IDs from Coolify/Dokploy/etc) → start blank for a fresh alias.
    setDraft(projectDisplay.length <= 25 ? projectDisplay : "");
    setEditing(true);
  };
  const commit = () => {
    if (!canEdit || !d.project) return;
    // Reset if the user types the original project (case-insensitive) —
    // no point storing an alias that's identical to the source key.
    const finalAlias = draft.trim().toLowerCase() === projectPart.trim().toLowerCase() ? "" : draft;
    d.onAliasChange?.(d.project, finalAlias);
    setEditing(false);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(projectDisplay);
  };
  const reset = () => {
    if (!canEdit || !d.project) return;
    d.onAliasChange?.(d.project, "");
  };

  return (
    <>
      <div className="group absolute top-0 left-0 right-0 px-5 py-2.5 flex items-center gap-2.5">
        <Icon size={16} style={{ color: config.color }} className="shrink-0" />
        {editing ? (
          <>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              onBlur={commit}
              maxLength={64}
              className="text-sm font-semibold tracking-wider uppercase bg-transparent border-none outline-none p-0 min-w-0"
              style={{ color: config.color, width: `${Math.max(draft.length * 9 + 8, 100)}px` }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
            {composePart && (
              <span
                className="text-sm font-semibold tracking-wider uppercase whitespace-nowrap"
                style={{ color: config.color }}
              >
                / {composePart}
              </span>
            )}
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); commit(); }}
              onMouseEnter={(e) => showBtnTip(e, t("group.saveAlias"))}
              onMouseLeave={hideBtnTip}
              className="text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
            >
              <Check size={14} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); cancel(); }}
              onMouseEnter={(e) => showBtnTip(e, t("group.cancelAlias"))}
              onMouseLeave={hideBtnTip}
              className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span
              className={`text-sm font-semibold tracking-wider uppercase whitespace-nowrap truncate min-w-0 ${canEdit ? "cursor-pointer hover:opacity-80" : ""}`}
              style={{ color: config.color }}
              onClick={canEdit ? startEdit : undefined}
              title={displayName}
            >
              {displayName}
            </span>
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(); }}
                onMouseEnter={(e) => showBtnTip(e, t("group.rename"))}
                onMouseLeave={hideBtnTip}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity shrink-0"
              >
                <Pencil size={11} />
              </button>
            )}
            {hasAlias && canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
                onMouseEnter={(e) => showBtnTip(e, t("group.resetAlias"))}
                onMouseLeave={hideBtnTip}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity shrink-0"
              >
                <RotateCcw size={11} />
              </button>
            )}
            {canColor && (
              <button
                ref={colorBtnRef}
                data-color-btn
                onClick={(e) => { e.stopPropagation(); palettePos ? closePalette() : openPalette(); }}
                onMouseEnter={(e) => showBtnTip(e, t("group.changeColor"))}
                onMouseLeave={hideBtnTip}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-3 h-3 rounded-full border border-slate-600/60 hover:scale-110 transition-transform"
                style={{ backgroundColor: config.color }}
              />
            )}
          </>
        )}
        <div className="flex-1 h-px min-w-2" style={{ backgroundColor: config.borderColor }} />
        {d.count != null && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Box size={12} style={{ color: config.borderColor }} />
            <span className="text-xs font-mono" style={{ color: config.borderColor }}>
              {d.count}
            </span>
          </div>
        )}
      </div>
      {d.subtitle && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center px-4">
          <span
            ref={footerRef}
            onMouseEnter={onFooterEnter}
            onMouseLeave={onFooterLeave}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-mono truncate max-w-[80%] tracking-wide transition-colors cursor-default"
          >
            {d.subtitle}
          </span>
        </div>
      )}
      {footerTip && createPortal(
        <div
          className="fixed z-[99999] pointer-events-none px-2 py-0.5 bg-slate-700 border border-slate-600 rounded-md text-[11px] leading-tight text-slate-200 whitespace-nowrap shadow-xl"
          style={{ left: footerTip.left, top: footerTip.top, transform: "translate(-50%, -100%)" }}
        >
          {d.subtitle}
        </div>,
        document.body
      )}
      {btnTip && createPortal(
        <div
          className="fixed z-[99999] pointer-events-none px-2 py-0.5 bg-slate-700 border border-slate-600 rounded-md text-[11px] leading-tight text-slate-200 whitespace-nowrap shadow-xl"
          style={{ left: btnTip.left, top: btnTip.top, transform: "translate(-50%, -100%)" }}
        >
          {btnTip.text}
        </div>,
        document.body
      )}
      {palettePos && createPortal(
        <div
          data-color-palette
          className="fixed z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 shadow-lg"
          style={{ left: palettePos.left, top: palettePos.top, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.hex}
              onClick={(e) => { e.stopPropagation(); pickColor(c.hex); }}
              className="w-5 h-5 rounded-full border border-slate-600/80 hover:scale-110 transition-transform"
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
          <div className="w-px h-5 bg-slate-700" />
          <button
            onClick={(e) => { e.stopPropagation(); closePalette(); }}
            className="w-5 h-5 rounded-full border border-slate-600/80 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <X size={11} />
          </button>
        </div>,
        document.body
      )}
    </>
  );
});
