import { useEffect, type ElementType } from "react";
import { Clapperboard, FileText, Film, Image, Music, ScrollText, Sparkles } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";
import type { WorkflowNodeType } from "../../types/node";

const items: Array<{ type: WorkflowNodeType; label: string; description: string; icon: ElementType }> = [
  { type: "text", label: "文本", description: "提示词 / 字幕 / 口播", icon: FileText },
  { type: "textGenerate", label: "Gemini 智能体", description: "提示词 / 脚本 / 反推", icon: Sparkles },
  { type: "image", label: "图片素材", description: "上传 / 引用图片", icon: Image },
  { type: "imageGenerate", label: "图片生成", description: "文生图 / 图生图 / 编辑", icon: Image },
  { type: "video", label: "视频生成", description: "图生视频 / 文生视频", icon: Film },
  { type: "audio", label: "音频", description: "配乐 / 旁白", icon: Music },
  { type: "script", label: "脚本", description: "分镜脚本 / Shot Prompt", icon: ScrollText },
  { type: "compose", label: "视频合成", description: "视频 / 音频 / 字幕", icon: Clapperboard }
];

export function AddNodeMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addNode = useCanvasStore((state) => state.addNode);

  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-add-node-menu]") || target?.closest("[data-sidebar-add-button]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div data-add-node-menu="true" className="pointer-events-auto fixed left-[76px] top-[72px] z-[9999] w-[240px] rounded-[18px] border border-white/[0.07] bg-[#141820]/[0.96] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mb-3 px-1 text-[18px] font-semibold tracking-[-0.01em] text-[#f3f5f7]">添加节点</div>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={`${item.type}-${item.label}`}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                addNode(item.type);
                onClose();
              }}
              className="group flex h-[54px] w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-white/[0.05]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.06] bg-white/[0.06] text-[#a2acba] transition group-hover:text-[#f3f5f7]">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-[#f3f5f7]">{item.label}</span>
                <span className="block text-[12px] text-[#8b95a5]">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
