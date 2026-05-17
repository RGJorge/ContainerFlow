import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Copy, Check, Container, GitBranch, Github, Star } from "lucide-react";
import type { UpdateInfo, DeployMode } from "../../shared/types";
import { useT } from "../i18n";

interface UpdateModalProps {
  info: UpdateInfo;
  onClose: () => void;
}

type TabKey = Exclude<DeployMode, "unknown">;

const COMMANDS: Record<TabKey, string> = {
  ghcr: "docker compose pull && docker compose up -d",
  source: "git pull && docker compose up -d --build",
};

export function UpdateModal({ info, onClose }: UpdateModalProps) {
  const { t } = useT();
  // Default tab: detected mode if it's ghcr or source, otherwise ghcr.
  const initialTab: TabKey = info.deployMode === "source" ? "source" : "ghcr";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [copied, setCopied] = useState(false);

  // Lock body scroll + block wheel events on canvas (React Flow zooms on wheel)
  // while the modal is open. Restore on close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const blockWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-update-modal]")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("wheel", blockWheel, { capture: true } as any);
    };
  }, []);

  const copy = async () => {
    const text = COMMANDS[tab];
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      // Fallback for non-secure contexts (HTTP from LAN IP, older browsers).
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      console.warn("ContainerFlow: clipboard copy failed");
    }
  };

  const releaseLines = info.releaseNotes ? info.releaseNotes.split("\n").slice(0, 15) : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        data-update-modal
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — 3-row grid so version aligns with "X versions behind"
            badge, and release-notes link aligns with the repo link. */}
        <div className="relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-5 pt-5 pb-3 border-b border-slate-800 items-center">
          {/* Close button — absolutely positioned top-right so it doesn't
              affect grid row heights. */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={18} />
          </button>

          {/* Row 1: label / (empty, X lives absolute) */}
          <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            {t("update.available")}
          </div>
          <div className="w-5" /> {/* spacer matching X width */}

          {/* Row 2: version / releases-behind badge */}
          <div className="text-lg font-bold tracking-tight">
            <span className="text-slate-300">v{info.current}</span>{" "}
            <span className="text-slate-500">→</span>{" "}
            <span className="text-emerald-400">v{info.latest}</span>
          </div>
          {info.releasesAhead > 1 ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 whitespace-nowrap justify-self-end">
              {t("update.releasesBehind").replace("{n}", String(info.releasesAhead))}
            </span>
          ) : (
            <div />
          )}

          {/* Row 3: release notes link / repo link */}
          {info.releaseUrl ? (
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors w-fit"
            >
              {t("update.fullNotes")}
              <ExternalLink size={11} />
            </a>
          ) : (
            <div />
          )}
          <a
            href={info.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap justify-self-end"
          >
            <Github size={12} />
            {t("update.viewRepo")}
            {info.stars !== null && (
              <span className="inline-flex items-center gap-0.5">
                · {info.stars.toLocaleString()}
                <Star size={10} />
              </span>
            )}
          </a>
        </div>

        {/* Release notes preview — caps height + scrolls when there are many changes */}
        {releaseLines.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              {t("update.whatsNew")}
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {releaseLines.map((line, i) => (
                <li key={i} className="text-sm text-slate-300 leading-relaxed flex gap-2">
                  <span className="text-slate-600 shrink-0">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* How to update — tabs */}
        <div className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            {t("update.howToUpdate")}
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-1 mb-3 bg-slate-800/50 rounded-lg p-1">
            <button
              onClick={() => setTab("ghcr")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === "ghcr"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Container size={13} />
              {t("update.tabGhcr")}
              {info.deployMode === "ghcr" && (
                <span className="text-[9px] text-emerald-400 ml-0.5">●</span>
              )}
            </button>
            <button
              onClick={() => setTab("source")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === "source"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <GitBranch size={13} />
              {t("update.tabSource")}
              {info.deployMode === "source" && (
                <span className="text-[9px] text-emerald-400 ml-0.5">●</span>
              )}
            </button>
          </div>

          {/* Tab description */}
          <div className="text-[11px] text-slate-500 mb-2">
            {tab === "ghcr" ? t("update.ghcrHint") : t("update.sourceHint")}
            {info.deployMode === tab && (
              <span className="text-emerald-400 ml-1.5">· {t("update.detectedMode")}</span>
            )}
          </div>

          {/* Command block */}
          <div className="relative bg-slate-950 border border-slate-800 rounded-md p-3 pr-12 font-mono text-[11px] text-slate-200 overflow-x-auto">
            <code className="whitespace-pre">{COMMANDS[tab]}</code>
            <button
              onClick={copy}
              className="absolute top-2 right-2 p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title={copied ? t("update.copied") : t("update.copyCommand")}
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
