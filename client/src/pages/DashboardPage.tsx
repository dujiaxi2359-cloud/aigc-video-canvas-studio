import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Mic, Plus, WandSparkles, Workflow } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import { formatTime } from "../utils/time";

const featured = [
  { title: "AI 商品视频", subtitle: "产品图到电商短片", tone: "from-[#3d2f57] via-[#725987] to-[#c5a6bc]" },
  { title: "智能眼镜短视频", subtitle: "时尚街拍与 UGC 镜头", tone: "from-[#133c45] via-[#34757c] to-[#a1c0b6]" },
  { title: "3D 产品广告", subtitle: "材质、灯光与镜头运动", tone: "from-[#2f3348] via-[#58688c] to-[#b1bdd1]" },
  { title: "电商主图工作流", subtitle: "一组素材生成完整视觉", tone: "from-[#4a302e] via-[#936d5e] to-[#d8b693]" }
];

export function DashboardPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [invalid, setInvalid] = useState(false);
  const { projects, fetchProjects, createProject, loadProject } = useProjectStore();
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const loadCanvasProject = useCanvasStore((state) => state.loadProject);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  useEffect(() => {
    fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  const recent = useMemo(() => projects.slice(0, 4), [projects]);

  async function begin(input = "", templateTitle?: string) {
    const clean = input.trim();
    if (input && !clean) {
      setInvalid(true);
      window.setTimeout(() => setInvalid(false), 650);
      return;
    }
    clearCanvas();
    if (clean || templateTitle) {
      addNode("image", { x: 220, y: 170 });
      addNode("video", { x: 690, y: 130 });
      const nodes = useCanvasStore.getState().nodes;
      const imageNode = nodes.find((node) => node.type === "image");
      const videoNode = [...nodes].reverse().find((node) => node.type === "video");
      if (videoNode) updateNodeData(videoNode.id, { prompt: clean || `使用 ${templateTitle} 模板创建一条商品视频` });
      if (imageNode && videoNode) useCanvasStore.getState().connectNodes({ source: imageNode.id, sourceHandle: "out", target: videoNode.id, targetHandle: "in-0" });
    }
    try {
      const project = await createProject(templateTitle || (clean ? clean.slice(0, 24) : "未命名项目"));
      await useProjectStore.getState().saveProject(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
      onNavigate("canvas", project.id);
    } catch {
      onNavigate("canvas", "new");
    }
  }

  async function openProject(id: string) {
    try {
      const project = await loadProject(id);
      loadCanvasProject(project.nodes, project.edges);
      onNavigate("canvas", id);
    } catch {
      onNavigate("canvas", id);
    }
  }

  return (
    <motion.div className="studio-page min-h-full overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <HomeTopNav page="home" onNavigate={onNavigate} />
      <main className="mx-auto max-w-[1480px] px-5 pb-16 pt-32 md:px-10">
        <section className="mx-auto max-w-[820px] text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.05] text-white/80 shadow-[0_18px_70px_rgba(0,0,0,.35)]"><WandSparkles size={21} /></div>
          <h1 className="mt-5 text-[36px] font-semibold tracking-[-0.035em] text-white md:text-[48px]">今天要做点什么？</h1>
          <p className="mt-3 text-[14px] text-white/38">从一个想法开始，自动搭建图片、视频和素材节点。</p>
          <div className={`studio-prompt-bar mx-auto mt-8 ${invalid ? "is-invalid" : ""}`}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void begin(prompt);
              }}
              placeholder="开始一段灵感对话..."
            />
            <button type="button" title="语音输入" className="studio-prompt-icon"><Mic size={17} /></button>
            <button type="button" title="开始创作" className="studio-prompt-submit" onClick={() => void begin(prompt)}><ArrowRight size={18} /></button>
          </div>
        </section>

        <section className="mt-16">
          <div className="mb-4 flex items-end justify-between">
            <div><div className="text-[18px] font-semibold">最近项目</div><div className="mt-1 text-[12px] text-white/34">继续上次的创作，或者从空白画布开始。</div></div>
            <button type="button" onClick={() => onNavigate("workspace")} className="text-[12px] text-white/46 hover:text-white">所有项目 <ArrowRight className="inline" size={13} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <button type="button" onClick={() => void begin()} className="studio-home-project group">
              <div className="grid aspect-[16/10] place-items-center bg-white/[0.025]"><span className="grid h-11 w-11 place-items-center rounded-full bg-white text-black transition group-hover:scale-105"><Plus size={20} /></span></div>
              <div className="p-3.5 text-left"><div className="text-[13px] font-semibold">新建项目</div><div className="mt-1 text-[11px] text-white/32">空白无限画布</div></div>
            </button>
            {recent.map((project, index) => (
              <button key={project.id} type="button" onClick={() => void openProject(project.id)} className="studio-home-project group">
                <div className={`relative aspect-[16/10] overflow-hidden bg-gradient-to-br ${featured[index % featured.length].tone}`}>
                  <Workflow className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/44" size={30} />
                  <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.14),transparent_42%,rgba(0,0,0,.28))]" />
                </div>
                <div className="p-3.5 text-left"><div className="truncate text-[13px] font-semibold">{project.name}</div><div className="mt-1 text-[11px] text-white/32">{formatTime(project.updatedAt)}</div></div>
              </button>
            ))}
          </div>
        </section>

      </main>
    </motion.div>
  );
}
