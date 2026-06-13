import { useEffect, type ElementType } from "react";
import { Clapperboard, FileText, Film, Image, Music, ScrollText, Sparkles, Upload } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";
import type { WorkflowNodeType } from "../../types/node";

const items: Array<{ type: WorkflowNodeType; label: string; description: string; icon: ElementType; group: "创作节点" | "辅助工具" | "添加资源" }> = [
  { type: "text", label: "文本", description: "脚本、广告词、品牌文案", icon: FileText, group: "创作节点" },
  { type: "imageGenerate", label: "图片", description: "生成、编辑与风格控制", icon: Image, group: "创作节点" },
  { type: "video", label: "视频", description: "文生、图生与参考生视频", icon: Film, group: "创作节点" },
  { type: "audio", label: "音频", description: "配乐与旁白", icon: Music, group: "创作节点" },
  { type: "textGenerate", label: "AI 智能体", description: "提示词优化与反推", icon: Sparkles, group: "辅助工具" },
  { type: "script", label: "分镜脚本", description: "镜头规划与 Shot Prompt", icon: ScrollText, group: "辅助工具" },
  { type: "compose", label: "视频合成", description: "视频、音频与字幕", icon: Clapperboard, group: "辅助工具" },
  { type: "image", label: "上传素材", description: "从本地添加图片素材", icon: Upload, group: "添加资源" }
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
    <div data-add-node-menu="true" className="pointer-events-auto fixed left-[78px] top-1/2 z-[9999] max-h-[calc(100vh-96px)] w-[268px] -translate-y-1/2 overflow-auto rounded-[18px] border border-white/[0.1] bg-[#1c1c1e]/[0.94] p-2.5 shadow-[0_28px_90px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
      <div className="mb-2 px-2 pt-1 text-[16px] font-semibold text-white">添加节点</div>
      {(["创作节点", "辅助工具", "添加资源"] as const).map((group) => (
        <div key={group} className="mb-2">
          <div className="px-2 py-1.5 text-[11px] font-medium text-white/35">{group}</div>
          {items.filter((item) => item.group === group).map((item) => {
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
                className="group flex min-h-[52px] w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition hover:bg-white/[0.08]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.06] text-white/58 transition group-hover:text-cyan-200">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-white/88">{item.label}</span>
                  <span className="block truncate text-[11px] text-white/38">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
