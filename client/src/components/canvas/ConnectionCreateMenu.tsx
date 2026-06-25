import { Clapperboard, FileText, Film, Image, Layers3, Music, ScrollText, Sparkles } from "lucide-react";
import type { WorkflowNodeType } from "../../types/node";

export type ConnectionCreateMenuState = {
  sourceId: string;
  sourceType: WorkflowNodeType;
  position: { x: number; y: number };
  flowPosition?: { x: number; y: number };
};

const meta: Record<WorkflowNodeType, { label: string; icon: React.ElementType }> = {
  text: { label: "文本", icon: FileText },
  textGenerate: { label: "创意工作台", icon: Sparkles },
  image: { label: "图片素材", icon: Image },
  imageGenerate: { label: "图片生成", icon: Image },
  video: { label: "视频生成", icon: Film },
  director_3d: { label: "3D 导演台", icon: Layers3 },
  audio: { label: "音频", icon: Music },
  script: { label: "脚本", icon: ScrollText },
  compose: { label: "视频合成", icon: Clapperboard }
};

const options: Record<WorkflowNodeType, { recommended: WorkflowNodeType[]; more: WorkflowNodeType[] }> = {
  text: { recommended: ["textGenerate", "imageGenerate", "video", "script"], more: ["director_3d", "compose", "image", "audio", "text"] },
  textGenerate: { recommended: ["imageGenerate", "video", "script", "compose"], more: ["director_3d", "text", "image", "audio"] },
  image: { recommended: ["director_3d", "textGenerate", "imageGenerate", "video"], more: ["compose", "script", "audio", "image", "text"] },
  imageGenerate: { recommended: ["director_3d", "video", "textGenerate", "imageGenerate"], more: ["compose", "script", "audio", "image", "text"] },
  director_3d: { recommended: ["imageGenerate", "video", "image"], more: ["textGenerate", "compose", "script", "audio", "text"] },
  video: { recommended: ["compose", "textGenerate", "video"], more: ["director_3d", "imageGenerate", "audio", "script", "image", "text"] },
  script: { recommended: ["textGenerate", "video", "imageGenerate", "compose"], more: ["director_3d", "text", "image", "audio"] },
  audio: { recommended: ["textGenerate", "compose", "video"], more: ["script", "imageGenerate", "director_3d", "text"] },
  compose: { recommended: ["textGenerate", "video", "compose"], more: ["director_3d", "imageGenerate", "image", "audio", "script", "text"] }
};

function MenuGroup({ title, items, onSelect }: { title: string; items: WorkflowNodeType[]; onSelect: (type: WorkflowNodeType) => void }) {
  return (
    <div>
      <div className="mb-1 mt-2 px-1 text-[11px] font-medium text-[#7d8796]">{title}</div>
      <div className="space-y-1">
        {items.map((type) => {
          const Icon = meta[type].icon;
          return (
            <button key={type} type="button" className="nodrag nopan flex h-[42px] w-full items-center gap-3 rounded-xl px-2 text-left text-[13px] text-[#cfd6e1] transition hover:bg-white/[0.05] hover:text-white" onClick={() => onSelect(type)}>
              <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-white/[0.06] bg-white/[0.06] text-[#a2acba]"><Icon size={15} strokeWidth={1.8} /></span>
              <span>{meta[type].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ConnectionCreateMenu({ menu, onSelect }: { menu: ConnectionCreateMenuState; onSelect: (type: WorkflowNodeType) => void }) {
  const groups = options[menu.sourceType];
  return (
    <div className="nodrag nopan fixed z-[9999] w-[220px] rounded-[18px] border border-white/[0.07] bg-[#141820]/[0.96] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl" style={{ left: menu.position.x, top: menu.position.y }}>
      <div className="px-1 text-[14px] font-semibold text-[#f3f5f7]">引用节点生成</div>
      <MenuGroup title="推荐下一步" items={groups.recommended} onSelect={onSelect} />
      <MenuGroup title="更多节点" items={groups.more} onSelect={onSelect} />
    </div>
  );
}
