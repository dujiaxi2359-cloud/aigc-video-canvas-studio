import type { NodeProps } from "reactflow";
import { ImagePlus, Upload } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { MediaPreview } from "../media/MediaPreview";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import type { ImageNodeData } from "../../types/node";

export function ImageNode(props: NodeProps<ImageNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const upload = useAssetStore((state) => state.uploadAsset);

  async function onFile(file?: File) {
    if (!file) return;
    const asset = await upload(file);
    update(props.id, { assetId: asset.id, url: asset.url, localPath: asset.localPath });
  }

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Image"
      width={440}
      footer={
        <div className="flex h-9 items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[12px] text-[#7d8796]">{props.data.assetId ? "素材已加载" : "等待图片输入"}</div>
          <label>
            <input className="nodrag nopan" hidden type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
            <span className="nodrag nopan inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-medium text-[#eef2f7] transition hover:bg-white/[0.06]">
              <Upload size={14} strokeWidth={1.8} /> 上传图片
            </span>
          </label>
        </div>
      }
    >
      {props.data.url ? (
        <MediaPreview type="image" title={props.data.title} previewUrl={props.data.thumbnailUrl || props.data.url} originalUrl={props.data.url} />
      ) : (
        <label className="media-preview cursor-pointer">
          <div className="text-center">
            <ImagePlus className="mx-auto mb-2 text-[#7b8798]" size={32} strokeWidth={1.7} />
            <div className="text-[13px] font-semibold text-[#e8edf3]">拖拽图片到这里，或点击上传</div>
            <div className="mt-1 text-[12px] text-[#7d8796]">产品图 / 参考图 / 首尾帧素材</div>
          </div>
          <input className="nodrag nopan" hidden type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
      )}
    </NodeShell>
  );
}
