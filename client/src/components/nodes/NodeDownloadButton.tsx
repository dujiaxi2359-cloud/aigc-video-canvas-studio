import { Download } from "lucide-react";
import { extensionFromUrl, sanitizeFilename, timestamp } from "../../services/exportApi";
import { downloadAsset, downloadAssetById } from "../../services/downloadApi";
import { Button } from "../common/Button";
import { useState } from "react";

type NodeDownloadButtonProps = {
  url?: string;
  assetId?: string;
  title?: string;
  kind: "image" | "video" | "compose";
  tooltip: string;
  label?: string;
};

const prefixByKind = {
  image: "aigc_image",
  video: "aigc_video",
  compose: "aigc_compose"
};

const fallbackExtByKind = {
  image: ".png",
  video: ".mp4",
  compose: ".mp4"
};

export function NodeDownloadButton({ url, assetId, title, kind, tooltip, label }: NodeDownloadButtonProps) {
  const [status, setStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
  if (!url && !assetId) return null;

  async function handleDownload(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!url && !assetId) return;
    setStatus("downloading");
    try {
      const filename = `${prefixByKind[kind]}_${sanitizeFilename(title || "node")}_${timestamp()}${url ? extensionFromUrl(url, fallbackExtByKind[kind]) : fallbackExtByKind[kind]}`;
      if (assetId) await downloadAssetById(assetId, filename);
      else if (url) {
        await downloadAsset(url, filename);
      }
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 1600);
    } catch (error) {
      setStatus("error");
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "导出失败。" }));
      window.setTimeout(() => setStatus("idle"), 2200);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="nodrag nopan h-7 rounded-full border-white/[0.08] bg-white/[0.035] px-2.5 text-[12px] text-[#cbd4df] hover:border-[#8b5cf6]/[0.28] hover:bg-white/[0.07] hover:text-white"
      title={tooltip}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={handleDownload}
    >
      <Download size={14} strokeWidth={1.8} />
      <span>{status === "downloading" ? "导出中" : status === "done" ? "完成" : status === "error" ? "失败" : label || tooltip}</span>
    </Button>
  );
}
