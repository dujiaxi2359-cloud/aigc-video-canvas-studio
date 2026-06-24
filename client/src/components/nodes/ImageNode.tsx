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
  Trash2,
  UserRound,
  View,
  X
} from "lucide-react";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { MediaPreview } from "../media/MediaPreview";
import { ImageAssetEditor } from "../media/ImageAssetEditor";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import type { ImageNodeData } from "../../types/node";

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

const imageSequenceActions = [
  {
    label: "镜头组照",
    icon: LayoutGrid,
    prompt: "基于参考图片制作一张多机位镜头组照：保持主体身份、服装、产品和场景连续一致，编排远景、中景、近景与细节镜头，形成可直接用于视频规划的视觉镜头表。"
  },
  {
    label: "连续动作板",
    icon: Grid3X3,
    prompt: "基于参考图片制作连续动作板：在同一主体与场景中推进起势、动作、转折和落点，镜头衔接清楚，人物与商品细节全程稳定。"
  },
  {
    label: "面部角度表",
    icon: View,
    prompt: "基于参考图片制作面部角度表：包含正面、侧面与三分之二侧面，严格保持五官、妆容、发型和人物身份一致，背景简洁。"
  },
  {
    label: "角色视觉档案",
    icon: UserRound,
    prompt: "基于参考图片建立角色视觉档案：整理全身、半身、表情与服装细节，锁定身份特征，供后续图生视频和多图参考持续使用。"
  },
  {
    label: "场景视觉档案",
    icon: Sparkles,
    prompt: "基于参考图片建立场景视觉档案：提炼空间结构、光线方向、关键材质与氛围规则，形成可复用的场景依据。"
  },
  {
    label: "商品视觉档案",
    icon: Package,
    prompt: "基于参考图片建立商品视觉档案：整理外观、比例、结构、材质、标识与关键细节，确保后续镜头不改变商品识别度。"
  }
];

export function ImageNode(props: NodeProps<ImageNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const addConnectedNode = useCanvasStore((state) => state.addConnectedNode);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const upload = useAssetStore((state) => state.uploadAsset);
  const [editorOpen, setEditorOpen] = useState(false);
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"angle" | null>(null);
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

  function downloadCurrent() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `${props.data.title || "image-asset"}.png`;
    link.click();
  }

  function togglePanel(panel: "angle") {
    setGridMenuOpen(false);
    setActivePanel((value) => value === panel ? null : panel);
  }

  const anglePanel = activePanel === "angle" ? (
    <div className="image-asset-command-panel is-angle">
      <button type="button" className="image-asset-panel-close" title="关闭" onClick={() => setActivePanel(null)}><X size={14} /></button>
      <div className="image-asset-panel-eyebrow"><Orbit size={14} /> 图片生成工具</div>
      <div className="image-asset-panel-title">多角度生成</div>
      <div className="image-asset-panel-copy">选择观察机位，创建已连接的多角度参考图节点；只改变镜头视角，不改变主体身份与产品结构。</div>
      <div className="image-asset-panel-grid">
        {["鱼眼视角", "倾斜视角", "正面俯拍", "正面仰拍", "全景俯拍", "背面视角"].map((label) => (
          <button key={label} type="button" onClick={() => { setActivePanel(null); createImageFollowUp(`基于参考图片生成${label}静态参考图：严格保持主体身份、面部特征、产品结构、服装、材质和场景一致，只改变相机观察角度；画面真实自然、细节清晰，可继续连接图生视频或分镜节点。`, `${label}参考图`); }}>{label}</button>
        ))}
      </div>
    </div>
  ) : null;

  const floatingToolbar = previewUrl ? (
    <div className="image-asset-production-toolbar nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
      <div className="image-asset-tool-group is-primary">
        <button type="button" className="image-asset-tool is-emphasis" title="全景延展" aria-label="全景延展" data-tooltip="向外扩展画面，不改变主体" onClick={() => { setActivePanel(null); createImageFollowUp("基于参考图片做全景延展：保持主体与场景真实一致，向画面外自然扩展环境，不改变主体比例和关键细节。", "全景延展"); }}>
          <Sparkles size={14} /><span>全景</span><small>NEW</small>
        </button>
        <button type="button" className="image-asset-tool" title="多角度视频参考" aria-label="多角度视频参考" data-tooltip="打开多角度编辑器" onClick={() => togglePanel("angle")}>
          <Orbit size={15} /><span>多角度</span>
        </button>
        <button type="button" className="image-asset-tool" title="局部重绘" aria-label="局部重绘" data-tooltip="涂抹要修改的区域" onClick={() => { setActivePanel(null); setGridMenuOpen(false); setEditorOpen(true); }}>
          <Brush size={15} /><span>局部重绘</span>
        </button>
        <div className={`image-asset-tool-menu ${gridMenuOpen ? "is-open" : ""}`}>
          <button type="button" className="image-asset-tool" title="分镜组图与视觉档案" aria-label="分镜组图与视觉档案" data-tooltip="整理镜头与视觉一致性" onClick={() => { setActivePanel(null); setGridMenuOpen((value) => !value); }}>
            <LayoutGrid size={15} /><span>分镜组图</span><ChevronDown size={13} />
          </button>
          {gridMenuOpen && (
            <div className="image-asset-tool-popover">
              {imageSequenceActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" onClick={() => { setGridMenuOpen(false); createImageFollowUp(item.prompt, item.label, item.label === "连续动作板" ? "1:1" : ratio); }}>
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
        <button type="button" className="image-asset-tool" title="宫格切分" aria-label="宫格切分" data-tooltip="按主体、场景、产品拆分" onClick={() => { setActivePanel(null); createImageFollowUp("将参考图片整理为宫格切分版：按主体、产品、场景和细节模块拆分，适合后续分镜和素材管理。", "宫格切分", "1:1"); }}>
          <Scissors size={15} /><span>切分</span>
        </button>
      </div>
      <div className="image-asset-tool-group is-icons">
        <button type="button" className="image-asset-icon-tool" title="下载" aria-label="下载" data-tooltip="下载素材" onClick={downloadCurrent}><Download size={15} /></button>
        <button type="button" className="image-asset-icon-tool" title="放大预览" aria-label="放大预览" data-tooltip="放大预览" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}><Maximize2 size={15} /></button>
        <button type="button" className="image-asset-icon-tool is-danger" title="删除节点" aria-label="删除节点" data-tooltip="删除节点" onClick={() => deleteNode(props.id)}><Trash2 size={15} /></button>
      </div>
      {anglePanel}
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
      floatingToolbar={floatingToolbar}
      hideInlineControls={Boolean(floatingToolbar)}
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
