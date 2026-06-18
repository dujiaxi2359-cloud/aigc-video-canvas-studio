import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Image, Layers3, Mic, Play, Plus, WandSparkles, Workflow } from "lucide-react";
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

const quickWorkflows = [
  { title: "商品图转视频", desc: "主图、运镜、卖点字幕", icon: Clapperboard, prompt: "把商品主图制作成 15 秒竖屏电商短视频" },
  { title: "批量素材变体", desc: "多比例、多场景输出", icon: Layers3, prompt: "基于现有素材生成多组适合投放的视频变体" },
  { title: "首帧视觉设计", desc: "构图、灯光、产品焦点", icon: Image, prompt: "先设计一个具有商业质感的视频首帧" }
];

function SpotlightPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const updateSpotlight = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !ref.current) return;
    ref.current.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    ref.current.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  };
  return <div ref={ref} onPointerMove={updateSpotlight} className={`video-spotlight-panel ${className}`}>{children}</div>;
}

export function DashboardPage({ onNavigate, navPage = "video" }: { onNavigate: (page: Page, projectId?: string) => void; navPage?: Page }) {
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
    <motion.div className="studio-page video-dashboard min-h-full overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <HomeTopNav page={navPage} onNavigate={onNavigate} />
      <main className="video-dashboard-main mx-auto max-w-[1440px] px-5 pb-16 pt-28 md:px-10">
        <section className="video-dashboard-hero">
          <SpotlightPanel className="video-command-panel">
            <div className="video-command-kicker"><WandSparkles size={14} /> AI 视频工作台</div>
            <h1>从一句话开始<br />搭建视频工作流</h1>
            <p>描述商品、受众与风格，我们会在无限画布中生成图片、视频和素材节点。</p>
            <div className={`studio-prompt-bar video-prompt-bar ${invalid ? "is-invalid" : ""}`}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void begin(prompt);
              }}
              placeholder="例如：为这款智能眼镜制作一条 15 秒小红书竖屏广告…"
            />
            <button type="button" title="语音输入" className="studio-prompt-icon"><Mic size={17} /></button>
            <button type="button" title="开始创作" className="studio-prompt-submit" onClick={() => void begin(prompt)}><ArrowRight size={18} /></button>
            </div>
            <div className="video-command-meta"><span>⌘ Enter 创建</span><span>自动连接节点</span><span>可随时继续编辑</span></div>
          </SpotlightPanel>

          <aside className="video-quick-panel" aria-label="快捷工作流">
            <div className="video-panel-heading"><div><span>快捷开始</span><strong>常用工作流</strong></div><Play size={16} /></div>
            <div className="video-quick-list">
              {quickWorkflows.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.title}
                    onClick={() => void begin(item.prompt, item.title)}
                    className="video-quick-item"
                    style={{ "--item-index": index } as CSSProperties}
                  >
                    <span className="video-quick-icon"><Icon size={17} /></span>
                    <span><strong>{item.title}</strong><small>{item.desc}</small></span>
                    <ArrowRight size={15} />
                  </button>
                );
              })}
            </div>
          </aside>
        </section>

        <section className="video-recent-section">
          <div className="video-section-heading">
            <div><div className="text-[18px] font-semibold">最近项目</div><div className="mt-1 text-[12px] text-white/38">继续编辑，或从空白无限画布开始。</div></div>
            <button type="button" onClick={() => onNavigate("workspace")}>查看全部 <ArrowRight size={13} /></button>
          </div>
          <div className="video-project-grid">
            <button type="button" onClick={() => void begin()} className="video-project-card video-project-new group">
              <div className="video-project-preview"><span><Plus size={20} /></span></div>
              <div className="video-project-copy"><div><strong>新建项目</strong><small>空白无限画布</small></div><ArrowRight size={14} /></div>
            </button>
            {recent.map((project, index) => (
              <button key={project.id} type="button" onClick={() => void openProject(project.id)} className="video-project-card group">
                <div className={`video-project-preview relative bg-gradient-to-br ${featured[index % featured.length].tone}`}>
                  <Workflow className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/44" size={30} />
                  <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.14),transparent_42%,rgba(0,0,0,.28))]" />
                </div>
                <div className="video-project-copy"><div><strong>{project.name}</strong><small>{formatTime(project.updatedAt)}</small></div><ArrowRight size={14} /></div>
              </button>
            ))}
          </div>
        </section>

      </main>
    </motion.div>
  );
}
