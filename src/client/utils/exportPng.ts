import { toPng } from "html-to-image";

const PIXEL_RATIO = 3;
const BACKGROUND = "#0f172a"; // slate-900 (matches dashboard)
const DOT_COLOR = "rgba(55, 65, 81, 0.7)"; // slate-700 at 70% — matches the perceptual softness of the SVG pattern
const DOT_GAP = 30;
const DOT_SIZE = 2;
// Hard cap to avoid browser canvas memory issues. 100M pixels ≈ 800 MB RAM.
const MAX_PIXELS = 100_000_000;

export interface ExportPngOptions {
  pixelRatio?: number;
  backgroundColor?: string;
}

export interface ExportPngResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Captures the dashboard canvas (React Flow area) as a PNG data URL.
 *
 * The React Flow `<Background>` component renders dots as an SVG `<pattern>`,
 * which html-to-image does not rasterize reliably across browsers. To get a
 * deterministic output we:
 *   1. Capture the React Flow area with transparent background (nodes/edges
 *      only) and skip the buggy SVG pattern via `filter`.
 *   2. Paint our own background + dot grid onto a canvas at the correct
 *      pixel ratio.
 *   3. Draw the captured layer on top.
 *
 * Overlay UI (Controls, MiniMap, EdgeLegend, anything with `data-no-export`)
 * is excluded so the export is just the graph itself.
 */
export async function exportGraphAsPng(opts: ExportPngOptions = {}): Promise<ExportPngResult> {
  const pixelRatio = opts.pixelRatio ?? PIXEL_RATIO;
  const backgroundColor = opts.backgroundColor ?? BACKGROUND;

  const target = document.querySelector(".react-flow") as HTMLElement | null;
  if (!target) {
    throw new Error("CANVAS_NOT_FOUND");
  }

  const rect = target.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  if (width === 0 || height === 0) {
    throw new Error("EMPTY_GRAPH");
  }
  if (width * height * pixelRatio * pixelRatio > MAX_PIXELS) {
    throw new Error("GRAPH_TOO_LARGE");
  }

  // 1. Temporarily disable CSS effects that don't translate well to a
  // rasterized PNG: Tailwind's `ring-*` (box-shadow halo around rounded
  // corners shows as harsh edges without backdrop-blur underneath) and
  // `backdrop-filter` (browsers don't capture it at all). Restored in
  // the `finally` block.
  const tempStyle = document.createElement("style");
  tempStyle.dataset.exportPngOverride = "true";
  tempStyle.textContent = `
    /* Only target service (container) nodes — group headers stay transparent
       so the group's outline / border remains visible at the top. */
    .react-flow__node:not(.react-flow__node-group) > * {
      --tw-ring-shadow: 0 0 #0000 !important;
      backdrop-filter: none !important;
      /* Solid dark fill so the dot grid doesn't bleed through node bodies.
         State is still indicated by the border colors and the inner state dot. */
      background-color: rgb(15 23 42 / 0.85) !important;
    }
  `;
  document.head.appendChild(tempStyle);

  let nodesDataUrl: string;
  try {
    // 2. Capture nodes/edges with transparent background.
    nodesDataUrl = await toPng(target, {
      width,
      height,
      pixelRatio,
      backgroundColor: undefined,
      filter: (node) => {
        // node is typed as HTMLElement but at runtime can be any Element (incl. SVG).
        // We rely on Element-level APIs which exist on both HTML and SVG.
        const el = node as Element;
        const cl = el.classList;
        if (!cl) return true;
        // Custom: anything explicitly marked
        if ((node as HTMLElement).dataset?.noExport === "true") return false;
        // React Flow overlays
        if (cl.contains("react-flow__controls")) return false;
        if (cl.contains("react-flow__minimap")) return false;
        if (cl.contains("react-flow__attribution")) return false;
        if (cl.contains("react-flow__panel")) return false;
        // We re-render the dots manually below, skip React Flow's SVG pattern.
        if (cl.contains("react-flow__background")) return false;
        return true;
      },
    });
  } finally {
    document.head.removeChild(tempStyle);
  }

  // 2. Load the captured image so we can composite it onto a canvas.
  const layer = await loadImage(nodesDataUrl);

  // 3. Composite: solid bg + dot grid + captured layer.
  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("CANVAS_CONTEXT_FAILED");
  }

  // Solid base
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dot grid (matches the React Flow <Background> config: gap 30, size 2)
  ctx.fillStyle = DOT_COLOR;
  const gap = DOT_GAP * pixelRatio;
  const radius = (DOT_SIZE * pixelRatio) / 2;
  for (let x = gap; x < canvas.width; x += gap) {
    for (let y = gap; y < canvas.height; y += gap) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Captured nodes/edges on top
  ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load failed: ${e}`));
    img.src = src;
  });
}

/**
 * Triggers a browser download of a data URL with a filename of the form
 * `containerflow-<hostname>-<timestamp>.png`.
 */
export function downloadPng(dataUrl: string, hostname?: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const host = hostname?.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "graph";
  const filename = `containerflow-${host}-${ts}.png`;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
