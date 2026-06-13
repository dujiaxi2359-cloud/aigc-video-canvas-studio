import type { NodeProps } from "reactflow";
import { ImagePlus, Upload } from "lucide-react";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { MediaPreview } from "../media/MediaPreview";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import type { ImageNodeData } from "../../types/node";
import { MediaPreviewActions } from "./MediaPreviewActions";

export function ImageNode(props: NodeProps<ImageNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const upload = useAssetStore((state) => state.uploadAsset);

  async function onFile(file?: File) {
    if (!file) return;
    const asset = await upload(file);
    update(props.id, { assetId: asset.id, url: asset.url, localPath: asset.localPath });
  }

  return (
    <CreationNodeFrame
      id={props.id}
      type={props.type}
      selected={props.selected}
      title={props.data.title || "Image"}
      ratio="1:1"
      status={props.data.assetId ? "success" : "idle"}
      toolbar={<MediaPreviewActions kind="image" url={props.data.url} assetId={props.data.assetId} title={props.data.title} nodeId={props.id} onSaved={(assetId) => update(props.id, { assetId })} />}
      preview={
        props.data.url ? <MediaPreview type="image" title={props.data.title} previewUrl={props.data.thumbnailUrl || props.data.url} originalUrl={props.data.url} aspectRatio="1:1" className="creation-media-preview" /> :
        <label className="creation-upload-preview nodrag nopan">
          <ImagePlus size={30} /><span>图片素材</span><small>点击或拖入上传</small>
          <input hidden type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
      }
      dock={<div className="creation-asset-dock"><span>{props.data.assetId ? "素材已加载" : "等待图片输入"}</span><label><input hidden type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} /><strong><Upload size={13} /> 上传</strong></label></div>}
    />
  );
}
