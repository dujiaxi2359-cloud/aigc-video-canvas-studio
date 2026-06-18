import type { NodeProps } from "reactflow";
import { useEffect, useMemo, useState } from "react";
import { ImagePlus } from "lucide-react";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { MediaPreview } from "../media/MediaPreview";
import { ImageAssetEditor } from "../media/ImageAssetEditor";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import type { ImageNodeData } from "../../types/node";
import { MediaPreviewActions } from "./MediaPreviewActions";

function ratioFromDimensions(width?: number, height?: number) {
  if (!width || !height) return undefined;
  const value = width / height;
  if (Math.abs(value - 9 / 16) < 0.006) return "9:16";
  if (Math.abs(value - 16 / 9) < 0.006) return "16:9";
  if (Math.abs(value - 1) < 0.006) return "1:1";
  if (Math.abs(value - 3 / 4) < 0.006) return "3:4";
  if (Math.abs(value - 4 / 3) < 0.006) return "4:3";
  if (Math.abs(value - 2 / 3) < 0.006) return "2:3";
  if (Math.abs(value - 3 / 2) < 0.006) return "3:2";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function ImageNode(props: NodeProps<ImageNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const upload = useAssetStore((state) => state.uploadAsset);
  const [editorOpen, setEditorOpen] = useState(false);
  const previewUrl = props.data.thumbnailUrl || props.data.url;
  const ratio = useMemo(() => ratioFromDimensions(props.data.width, props.data.height) || props.data.aspectRatio || "9:16", [props.data.aspectRatio, props.data.height, props.data.width]);

  useEffect(() => {
    if (!previewUrl) return;
    const image = new window.Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const aspectRatio = ratioFromDimensions(width, height);
      if (!width || !height || !aspectRatio) return;
      if (props.data.width === width && props.data.height === height && props.data.aspectRatio === aspectRatio) return;
      update(props.id, { width, height, aspectRatio });
    };
    image.src = previewUrl;
  }, [previewUrl, props.data.aspectRatio, props.data.height, props.data.width, props.id, update]);

  async function onFile(file?: File) {
    if (!file) return;
    try {
      const asset = await upload(file);
      update(props.id, { assetId: asset.id, url: asset.url, localPath: asset.localPath, thumbnailUrl: asset.thumbnailUrl, width: undefined, height: undefined, aspectRatio: undefined });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "上传图片素材失败，请检查文件或网络。");
    }
  }

  return (
    <>
    <CreationNodeFrame
      id={props.id}
      type={props.type}
      selected={props.selected}
      title={props.data.title || "Image"}
      ratio={ratio}
      status={props.data.assetId ? "success" : "idle"}
      toolbar={
        <MediaPreviewActions
          kind="image"
          url={previewUrl}
          assetId={props.data.assetId}
          title={props.data.title}
          nodeId={props.id}
          onEdit={() => setEditorOpen(true)}
          onSaved={(assetId) => update(props.id, { assetId })}
        />
      }
      preview={
        props.data.url ? <MediaPreview type="image" title={props.data.title} previewUrl={previewUrl} originalUrl={props.data.url} thumbnailUrl={props.data.thumbnailUrl} aspectRatio={ratio} className="creation-media-preview" showInlineActions={false} /> :
        <label className="creation-upload-preview">
          <ImagePlus size={30} /><span>图片素材</span><small>点击或拖入上传</small>
          <input hidden type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
      }
    />
    <ImageAssetEditor
      open={editorOpen}
      src={previewUrl}
      title={props.data.title || "图片素材"}
      uploadAsset={upload}
      onClose={() => setEditorOpen(false)}
      onSaved={(asset) => update(props.id, { assetId: asset.id, url: asset.url, localPath: asset.localPath, thumbnailUrl: asset.thumbnailUrl, width: undefined, height: undefined, aspectRatio: undefined })}
    />
    </>
  );
}
