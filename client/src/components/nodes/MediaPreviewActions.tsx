import { Brush, Check, Download, FolderPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { assetApi } from "../../services/assetApi";
import { downloadAsset, downloadAssetById } from "../../services/downloadApi";
import { extensionFromUrl, sanitizeFilename, timestamp } from "../../services/exportApi";
import { useAssetStore } from "../../store/assetStore";

type MediaPreviewActionsProps = {
  kind: "image" | "video";
  url?: string;
  assetId?: string;
  title?: string;
  nodeId?: string;
  onSaved?: (assetId: string) => void;
  onEdit?: () => void;
};

const mediaDefaults = {
  image: {
    name: "生成图片",
    prefix: "aigc_image",
    extension: ".png"
  },
  video: {
    name: "生成视频",
    prefix: "aigc_video",
    extension: ".mp4"
  }
} as const;

export function MediaPreviewActions({ kind, url, assetId, title, nodeId, onSaved, onEdit }: MediaPreviewActionsProps) {
  const fetchAssets = useAssetStore((state) => state.fetchAssets);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [downloading, setDownloading] = useState(false);
  const defaults = mediaDefaults[kind];

  if (!url && !assetId) return null;

  async function saveToLibrary(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSaveStatus("saving");
    try {
      let savedAssetId = assetId;
      if (!savedAssetId && url) {
        const asset = await assetApi.importGenerated({
          url,
          name: title || defaults.name,
          nodeId
        });
        savedAssetId = asset.id;
        onSaved?.(asset.id);
      }
      await fetchAssets();
      setSaveStatus("saved");
      window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "assets" }));
      window.setTimeout(() => setSaveStatus("idle"), 1800);
    } catch (error) {
      setSaveStatus("idle");
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "保存到素材库失败。" }));
    }
  }

  async function download(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDownloading(true);
    try {
      if (assetId) {
        downloadAssetById(assetId);
      } else if (url) {
        const filename = `${defaults.prefix}_${sanitizeFilename(title || "node")}_${timestamp()}${extensionFromUrl(url, defaults.extension)}`;
        await downloadAsset(url, filename);
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "下载失败。" }));
    } finally {
      window.setTimeout(() => setDownloading(false), 500);
    }
  }

  return (
    <div className="creation-preview-toolbar nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
      {kind === "image" && url && onEdit ? (
        <button
          type="button"
          data-tooltip="编辑涂抹"
          aria-label="编辑涂抹"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onEdit();
          }}
        >
          <Brush size={15} />
        </button>
      ) : null}
      <button type="button" data-tooltip="保存到素材库" aria-label="保存到素材库" onClick={saveToLibrary}>
        {saveStatus === "saving" ? <Loader2 className="animate-spin" size={15} /> : saveStatus === "saved" ? <Check size={15} /> : <FolderPlus size={15} />}
      </button>
      <button type="button" data-tooltip="下载" aria-label="下载" onClick={download}>
        {downloading ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
      </button>
    </div>
  );
}
