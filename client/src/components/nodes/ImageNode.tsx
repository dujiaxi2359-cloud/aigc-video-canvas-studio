import type { NodeProps } from "reactflow";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Brush,
  ChevronDown,
  Download,
  Grid3X3,
  ImagePlus,
  LayoutGrid,
  Maximize2,
  Orbit,
  Package,
  Scissors,
  Sparkles,
  SunMedium,
  UserRound,
  View
} from "lucide-react";
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

const imageGridActions = [
  {
    label: "多机位九宫格",
    icon: LayoutGrid,
    prompt: "基于参考图片生成多机位九宫格：保持主体、服装、产品和场景一致，输出 9 个不同机位视角，构图清晰，适合做视觉分镜参考。"
  },
  {
    label: "剧情推演四宫格",
    icon: Grid3X3,
    prompt: "基于参考图片生成剧情推演四宫格：同一主体和场景连续发生动作变化，四格之间逻辑连贯，适合短视频分镜。"
  },
  {
    label: "角色脸部三视图",
    icon: View,
    prompt: "基于参考图片生成角色脸部三视图：正面、侧面、三分之二侧面，保持五官、妆容、发型和身份一致，干净背景。"
  },
  {
    label: "角色设定图",
    icon: UserRound,
    prompt: "基于参考图片生成角色设定图：全身、半身、表情和服装细节保持一致，适合作为后续图生视频和多图参考。"
  },
  {
    label: "场景设定图",
    icon: Sparkles,
    prompt: "基于参考图片提炼并生成场景设定图：保持空间结构、光线方向、材质和氛围一致，画面干净可复用。"
  },
  {
    label: "产品设定图",
    icon: Package,
    prompt: "基于参考图片生成产品设定图：严格保持产品外观、比例、结构、材质和标识，不改变商品识别度。"
  }
];

export function ImageNode(props: NodeProps<ImageNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const addConnectedNode = useCanvasStore((state) => state.addConnectedNode);
  const upload = useAssetStore((state) => state.uploadAsset);
  const [editorOpen, setEditorOpen] = useState(false);
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
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

  function createImageFollowUp(prompt: string, title = "图片生成", aspectRatio = ratio) {
    addConnectedNode(props.id, "imageGenerate", undefined, {
      title,
      prompt,
      inputMode: "image-to-image",
      aspectRatio,
      imageSize: "1K",
      imageQuality: "high",
      generateCount: 1,
      status: "idle"
    });
  }

  function createVideoFollowUp(prompt: string, title = "视频节点", aspectRatio = ratio) {
    addConnectedNode(props.id, "video", undefined, {
      title,
      prompt,
      inputMode: "reference-to-video",
      videoMode: "reference_images_to_video",
      aspectRatio,
      resolution: "720p",
      duration: 8,
      generateCount: 1,
      status: "idle"
    });
  }

  function downloadCurrent() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `${props.data.title || "image-asset"}.png`;
    link.click();
  }

  const floatingToolbar = previewUrl ? (
    <div className="image-asset-production-toolbar nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="image-asset-tool is-emphasis" title="全景延展" onClick={() => createImageFollowUp("基于参考图片做全景延展：保持主体与场景真实一致，向画面外自然扩展环境，不改变主体比例和关键细节。", "全景延展")}>
        <Sparkles size={14} /><span>全景</span><small>NEW</small>
      </button>
      <button type="button" className="image-asset-tool" title="多角度视频参考" onClick={() => createVideoFollowUp("基于参考图片生成多角度展示视频：保持主体身份、产品和场景一致，镜头自然切换多个观察角度。", "多角度视频")}>
        <Orbit size={15} /><span>多角度</span>
      </button>
      <button type="button" className="image-asset-tool" title="打光优化" onClick={() => createImageFollowUp("基于参考图片做商业打光优化：保持主体和构图不变，增强自然光影、层次、质感和产品可见度。", "打光优化")}>
        <SunMedium size={15} /><span>打光</span>
      </button>
      <div className={`image-asset-tool-menu ${gridMenuOpen ? "is-open" : ""}`}>
        <button type="button" className="image-asset-tool" title="九宫格与设定图" onClick={() => setGridMenuOpen((value) => !value)}>
          <Grid3X3 size={15} /><span>九宫格</span><ChevronDown size={13} />
        </button>
        {gridMenuOpen && (
          <div className="image-asset-tool-popover">
            {imageGridActions.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} type="button" onClick={() => { setGridMenuOpen(false); createImageFollowUp(item.prompt, item.label, item.label.includes("四宫格") ? "1:1" : ratio); }}>
                  <Icon size={15} /><span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" className="image-asset-tool compact" title="高清增强" onClick={() => createImageFollowUp("基于参考图片做高清增强：保持主体完全一致，提升清晰度、质感和细节，不改变构图与比例。", "高清增强")}>
        <Badge size={17} /><span>高清</span>
      </button>
      <button type="button" className="image-asset-tool" title="宫格切分" onClick={() => createImageFollowUp("将参考图片整理为宫格切分版：按主体、产品、场景和细节模块拆分，适合后续分镜和素材管理。", "宫格切分", "1:1")}>
        <Scissors size={15} /><span>宫格切分</span>
      </button>
      <span className="image-asset-tool-divider" />
      <button type="button" className="image-asset-icon-tool" title="编辑涂抹" onClick={() => setEditorOpen(true)}><Brush size={15} /></button>
      <button type="button" className="image-asset-icon-tool" title="下载" onClick={downloadCurrent}><Download size={15} /></button>
      <button type="button" className="image-asset-icon-tool" title="放大预览" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}><Maximize2 size={15} /></button>
    </div>
  ) : null;

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
      floatingToolbar={floatingToolbar}
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
