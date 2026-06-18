import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Image, Layers3, Mic, Play, Plus, WandSparkles, Workflow } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useI18nStore } from "../i18n";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import { formatTime } from "../utils/time";

const featured = [
  { title: "AI 商品视频", subtitle: "产品图到电商短片", tone: "from-[#3d2f57] via-[#725987] to-[#c5a6bc]" },
  { title: "智能眼镜短视频", subtitle: "时尚街拍与 UGC 镜头", tone: "from-[#133c45] via-[#34757c] to-[#a1c0b6]" },
  { title: "3D 产品广告", subtitle: "材质、灯光与镜头运动", tone: "from-[#2f3348] via-[#58688c] to-[#b1bdd1]" },
  { title: "电商主图工作流", subtitle: "一组素材生成完整视觉", tone: "from-[#4a302e] via-[#936d5e] to-[#d8b693]" }
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
  const t = useI18nStore((state) => state.t);
  const { projects, fetchProjects, createProject, loadProject } = useProjectStore();
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const loadCanvasProject = useCanvasStore((state) => state.loadProject);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  useEffect(() => {
    fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  const recent = useMemo(() => projects.slice(0, 4), [projects]);
  const localizedQuickWorkflows = useMemo(() => ([
    { title: t("dashboard.templateProduct"), desc: t("dashboard.templateProductSub"), icon: Clapperboard, prompt: t("dashboard.templateProduct") },
    { title: t("dashboard.templateVariants"), desc: t("dashboard.templateVariantsSub"), icon: Layers3, prompt: t("dashboard.templateVariants") },
    { title: t("dashboard.templateFirstFrame"), desc: t("dashboard.templateFirstFrameSub"), icon: Image, prompt: t("dashboard.templateFirstFrame") }
  ]), [t]);

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
      if (videoNode) updateNodeData(videoNode.id, { prompt: clean || `${templateTitle}` });
      if (imageNode && videoNode) useCanvasStore.getState().connectNodes({ source: imageNode.id, sourceHandle: "out", target: videoNode.id, targetHandle: "in-0" });
    }
    try {
      const project = await createProject(templateTitle || (clean ? clean.slice(0, 24) : t("common.untitledProject")));
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
            <div className="video-command-kicker"><WandSparkles size={14} /> {t("dashboard.kicker")}</div>
            <h1>{t("dashboard.title")}</h1>
            <p>{t("dashboard.subtitle")}</p>
            <div className={`studio-prompt-bar video-prompt-bar ${invalid ? "is-invalid" : ""}`}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void begin(prompt);
              }}
              placeholder={t("dashboard.placeholder")}
            />
            <button type="button" title={t("dashboard.voiceInput")} className="studio-prompt-icon"><Mic size={17} /></button>
            <button type="button" title={t("dashboard.start")} className="studio-prompt-submit" onClick={() => void begin(prompt)}><ArrowRight size={18} /></button>
            </div>
            <div className="video-command-meta"><span>{t("dashboard.metaCreate")}</span><span>{t("dashboard.metaConnect")}</span><span>{t("dashboard.metaEditable")}</span></div>
          </SpotlightPanel>

          <aside className="video-quick-panel" aria-label={t("dashboard.quickAria")}>
            <div className="video-panel-heading"><div><span>{t("dashboard.quickStart")}</span><strong>{t("dashboard.workflows")}</strong></div><Play size={16} /></div>
            <div className="video-quick-list">
              {localizedQuickWorkflows.map((item, index) => {
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
            <div><div className="text-[18px] font-semibold">{t("dashboard.recent")}</div><div className="mt-1 text-[12px] text-white/38">{t("dashboard.recentDesc")}</div></div>
            <button type="button" onClick={() => onNavigate("workspace")}>{t("dashboard.allProjects")} <ArrowRight size={13} /></button>
          </div>
          <div className="video-project-grid">
            <button type="button" onClick={() => void begin()} className="video-project-card video-project-new group">
              <div className="video-project-preview"><span><Plus size={20} /></span></div>
              <div className="video-project-copy"><div><strong>{t("dashboard.newProject")}</strong><small>{t("dashboard.blankCanvas")}</small></div><ArrowRight size={14} /></div>
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
