import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Image, Layers3, PenLine, Sparkles } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";

const presets = [
  "生成一组跨境电商商品主图，突出材质、卖点和使用场景",
  "为新品详情页规划三张图文海报，包含标题、利益点和镜头说明",
  "根据产品图生成社媒种草封面，风格高级、信息清晰"
];

export function PhotoStudioPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createProject = useProjectStore((state) => state.createProject);

  async function begin(input = prompt) {
    const clean = input.trim() || "图文创作项目";
    clearCanvas();
    addNode("textGenerate", { x: 220, y: 150 });
    addNode("imageGenerate", { x: 700, y: 130 });
    const nodes = useCanvasStore.getState().nodes;
    const textNode = nodes.find((node) => node.type === "textGenerate");
    const imageNode = nodes.find((node) => node.type === "imageGenerate");
    if (textNode) updateNodeData(textNode.id, { title: "图文策划", prompt: clean, taskType: "prompt-polish" });
    if (imageNode) updateNodeData(imageNode.id, { title: "图像生成", prompt: clean, aspectRatio: "1:1", inputMode: "text-to-image" });
    if (textNode && imageNode) {
      useCanvasStore.getState().connectNodes({ source: textNode.id, sourceHandle: "out", target: imageNode.id, targetHandle: "in-0" });
    }

    try {
      const project = await createProject(clean.slice(0, 24));
      await useProjectStore.getState().saveProject(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
      onNavigate("canvas", project.id);
    } catch {
      onNavigate("canvas", "new");
    }
  }

  return (
    <motion.div className="studio-page min-h-full overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <HomeTopNav page="photos" onNavigate={onNavigate} />
      <main className="mx-auto max-w-[1180px] px-5 pb-16 pt-28 md:px-10">
        <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.05] text-white/78">
              <Image size={22} />
            </span>
            <h1 className="mt-5 text-[38px] font-semibold leading-tight text-white md:text-[52px]">图文创作</h1>
            <p className="mt-4 max-w-[560px] text-[14px] leading-7 text-white/45">
              从商品卖点、视觉方向或一段简单想法开始，自动搭建文案策划和图片生成节点。后续可以继续在同一个画布里接入视频节点。
            </p>
          </div>
          <div className="rounded-[10px] border border-white/[0.1] bg-white/[0.045] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
              <PenLine size={16} /> 新建图文项目
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="mt-4 min-h-[150px] w-full resize-none rounded-[9px] border border-white/[0.1] bg-black/20 p-4 text-[14px] leading-6 text-white outline-none placeholder:text-white/26 focus:border-white/[0.22]"
              placeholder="输入产品、受众、风格或画面要求..."
            />
            <div className="mt-3 grid gap-2">
              {presets.map((item) => (
                <button key={item} type="button" onClick={() => setPrompt(item)} className="rounded-[8px] border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-left text-[12px] leading-5 text-white/48 transition hover:bg-white/[0.07] hover:text-white/78">
                  {item}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void begin()} className="studio-primary-button mt-4 h-11 w-full">
              生成图文画布 <ArrowRight size={16} />
            </button>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: Sparkles, title: "文案策划", copy: "先整理卖点、标题和提示词，减少直接出图的试错。" },
            { icon: Image, title: "图片生成", copy: "默认创建图片生成节点，后续可接入已有商品图。" },
            { icon: Layers3, title: "继续扩展", copy: "同一个项目里可以再接视频节点，完成图文到短片。" }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-[10px] border border-white/[0.08] bg-white/[0.035] p-5">
                <Icon size={18} className="text-white/72" />
                <h2 className="mt-4 text-[15px] font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-[12px] leading-6 text-white/38">{item.copy}</p>
              </div>
            );
          })}
        </section>
      </main>
    </motion.div>
  );
}
