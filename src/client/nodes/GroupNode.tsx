import { memo, useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Server, Wrench, Rocket, Box, Folder, Pencil, RotateCcw, Check, X } from "lucide-react";
import { useT } from "../i18n";

interface GroupNodeData {
  label: string;
  subtitle?: string;
  count?: number;
  /** Original (raw) project key used to look up / save the alias. */
  project?: string;
  /** Current alias if set, else undefined / empty string. */
  alias?: string;
  /** Save handler — called with (project, newAlias). Empty newAlias = reset. */
  onAliasChange?: (project: string, newAlias: string) => void;
  [key: string]: unknown;
}

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

export const GroupNode = memo(function GroupNode({ data }: NodeProps) {
  const { t } = useT();
  const d = data as unknown as GroupNodeData;
  // Label is "PROJECT / COMPOSE" (uppercase). We let users alias only the
  // project portion — the compose suffix (DEV / PROD / INFRA / docker-compose
  // file name) stays as a structural hint and is also used for the icon match.
  const labelParts = d.label.split(" / ");
  const projectPart = labelParts[0] || d.label;
  const composePart = labelParts.length > 1 ? labelParts.slice(1).join(" / ") : "";
  const iconKey = composePart || d.label;
  const known = groupConfig[iconKey];
  const proj = known ? null : getProjectColor(d.label);
  const config = known || { icon: Folder, color: proj!.color, borderColor: proj!.borderColor };
  const Icon = config.icon;

  const hasAlias = Boolean(d.alias && d.alias.trim().length > 0);
  const projectDisplay = hasAlias ? d.alias! : projectPart;
  const displayName = composePart ? `${projectDisplay} / ${composePart}` : projectDisplay;
  const canEdit = Boolean(d.project && d.onAliasChange);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectDisplay);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
              className="text-sm font-semibold tracking-wider uppercase"
              style={{ color: config.color }}
            >
              / {composePart}
            </span>
          )}
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); commit(); }}
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
            title={t("group.saveAlias")}
          >
            <Check size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); cancel(); }}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title={t("group.cancelAlias")}
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span
            className={`text-sm font-semibold tracking-wider uppercase ${canEdit ? "cursor-pointer hover:opacity-80" : ""}`}
            style={{ color: config.color }}
            onClick={canEdit ? startEdit : undefined}
          >
            {displayName}
          </span>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); startEdit(); }}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
              title={t("group.rename")}
            >
              <Pencil size={11} />
            </button>
          )}
          {hasAlias && canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
              title={t("group.resetAlias")}
            >
              <RotateCcw size={11} />
            </button>
          )}
        </>
      )}
      {d.subtitle && (
        <span className="text-xs text-slate-600 font-mono truncate max-w-[220px]">
          {d.subtitle}
        </span>
      )}
      <div className="flex-1 h-px" style={{ backgroundColor: config.borderColor }} />
      {d.count != null && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Box size={12} style={{ color: config.borderColor }} />
          <span className="text-xs font-mono" style={{ color: config.borderColor }}>
            {d.count}
          </span>
        </div>
      )}
    </div>
  );
});
