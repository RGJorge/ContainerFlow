import { useState } from "react";
import { ControlButton } from "@xyflow/react";
import { Download, Loader2 } from "lucide-react";
import { useT } from "../i18n";
import { exportGraphAsPng, downloadPng } from "../utils/exportPng";

interface Props {
  onError?: (message: string) => void;
}

export function ExportPngButton({ onError }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { dataUrl } = await exportGraphAsPng();
      downloadPng(dataUrl, window.location.hostname);
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      const message =
        code === "EMPTY_GRAPH"
          ? t("controls.exportPng.empty")
          : code === "GRAPH_TOO_LARGE"
            ? t("controls.exportPng.tooLarge")
            : t("controls.exportPng.failed");
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ControlButton onClick={handleClick} title={t("controls.exportPng")} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
    </ControlButton>
  );
}
