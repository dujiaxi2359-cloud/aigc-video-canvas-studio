import type { NodeProps } from "reactflow";
import { Play, Upload } from "lucide-react";
import { Button } from "../common/Button";
import { NodeShell } from "./NodeShell";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import { absoluteUploadUrl } from "../../utils/file";
import type { AudioNodeData } from "../../types/node";

export function AudioNode(props: NodeProps<AudioNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const upload = useAssetStore((state) => state.uploadAsset);

  async function onFile(file?: File) {
    if (!file) return;
    const asset = await upload(file);
    update(props.id, { assetId: asset.id, url: asset.url });
  }

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Audio"
      width={320}
      footer={
        <label>
          <input className="nodrag nopan" hidden type="file" accept="audio/*" onChange={(event) => onFile(event.target.files?.[0])} />
          <span className="nodrag nopan inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-medium text-[#eef2f7] transition hover:bg-white/[0.06]">
            <Upload size={14} strokeWidth={1.8} /> 上传音频
          </span>
        </label>
      }
    >
      <div className="rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,#232833_0%,#20242d_100%)] p-3">
        <div className="mb-3 flex items-center gap-3">
          <Button variant="secondary" className="nodrag nopan h-9 w-9 rounded-full px-0">
            <Play size={15} strokeWidth={1.8} />
          </Button>
          <div>
            <div className="text-[14px] font-semibold text-[#f3f5f7]">音频轨道</div>
            <div className="text-[12px] text-[#7d8796]">{props.data.url ? "已加载音频素材" : "等待上传 mp3 / wav"}</div>
          </div>
        </div>
        <div className="flex h-10 items-center gap-1">
          {Array.from({ length: 28 }).map((_, index) => (
            <span key={index} className="w-1 rounded-full bg-[#5cc8ff]/50" style={{ height: `${10 + ((index * 17) % 34)}px` }} />
          ))}
        </div>
        {props.data.url && <audio className="nodrag nopan mt-3 w-full" controls src={absoluteUploadUrl(props.data.url)} />}
      </div>
    </NodeShell>
  );
}
