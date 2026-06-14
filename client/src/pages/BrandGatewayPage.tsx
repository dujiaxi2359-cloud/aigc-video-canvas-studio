import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Database,
  Image,
  Link2,
  Palette,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
  type LucideIcon
} from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { HomeLaunchIntro } from "../components/home/HomeLaunchIntro";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";

const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "AIGCNONG个人工作室";

const quickPrompts = [
  { label: "电商主图", prompt: "为新品生成一组高级电商主图，突出材质、卖点和使用场景。", mode: "photos" as const },
  { label: "产品视频", prompt: "把产品主图生成 15 秒竖屏商业短视频，包含开场、卖点展示和结尾定格。", mode: "video" as const },
  { label: "图生视频", prompt: "基于商品图片生成短视频镜头，风格干净高级，适合投放和社媒展示。", mode: "video" as const }
];

const proofItems: Array<{ label: string; value: string; icon: LucideIcon }> = [
  { label: "Unified API", value: "一次配置，图文视频共用", icon: ShieldCheck },
  { label: "Asset Logic", value: "素材与项目集中管理", icon: Database },
  { label: "Team Flow", value: "流程沉淀，团队复用", icon: UsersRound }
];

const toolCards: Array<{
  title: string;
  desc: string;
  icon: LucideIcon;
  className: string;
  accent: string;
  stat?: string;
}> = [
  {
    title: "商业视频工作流",
    desc: "从脚本拆解、镜头编排到字幕与成片导出，用可复用节点流程稳定完成内容生产。",
    icon: Clapperboard,
    className: "lg:col-span-3",
    accent: "from-[#5978ff] via-[#19c8d7] to-transparent"
  },
  {
    title: "统一生产链路",
    desc: "图文、视频、素材与模型配置在同一空间协作。",
    icon: Sparkles,
    className: "",
    accent: "from-[#f97345] via-[#f5c451] to-transparent",
    stat: "1套"
  },
  {
    title: "商品视觉生成",
    desc: "完成背景替换、场景延展、产品主图和详情页素材生成。",
    icon: Image,
    className: "",
    accent: "from-[#6175ff] via-[#16c4d9] to-transparent"
  },
  {
    title: "品牌模板体系",
    desc: "沉淀品牌字体、色彩与版式规范，让批量内容保持一致。",
    icon: Palette,
    className: "",
    accent: "from-[#15bd8d] via-[#55dfbd] to-transparent"
  },
  {
    title: "可复用生产流程",
    desc: "通过可视化节点连接模型与素材，支持批量处理、自动化和团队复用。",
    icon: Link2,
    className: "lg:col-span-2",
    accent: "from-[#f14d97] via-[#fa5a68] to-transparent"
  }
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 }
};

function inferMode(prompt: string): "photos" | "video" {
  if (/主图|详情|海报|图文|图片|封面|视觉|商品图/.test(prompt)) return "photos";
  return "video";
}

function ProductPreview({ type }: { type: "photos" | "video" }) {
  if (type === "photos") {
    return (
      <div className="home-product-preview home-product-preview-photos">
        <div className="home-preview-titlebar">
          <div className="home-preview-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="home-preview-title">商品主图 · 1:1</span>
          <span className="home-preview-status">已同步</span>
        </div>
        <div className="home-preview-frame home-preview-frame-photos">
          <div className="home-preview-rail">
            {[Image, Palette, Sparkles].map((Tool, index) => (
              <Tool key={index} size={17} className={index === 0 ? "text-white" : "text-white/42"} />
            ))}
          </div>
          <div className="home-preview-photo-stage">
            <img src="/home-assets/commerce-image-studio.jpg" alt="商品视觉生产预览" />
            <div className="home-preview-photo-label">NEW SEASON</div>
          </div>
          <div className="home-preview-props">
            <div className="home-preview-props-title">属性</div>
            <div className="home-preview-bars">
              {[72, 54, 82].map((width) => (
                <span key={width}>
                  <i style={{ width: `${width}%` }} />
                </span>
              ))}
            </div>
            <div className="home-preview-swatches">
              {["#dfe7e2", "#76b9ad", "#25292b"].map((color) => (
                <span key={color} style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-product-preview home-product-preview-video">
      <div className="home-preview-titlebar">
        <Play size={15} className="text-[#f3a077]" />
        <span className="home-preview-title">商品短视频 · 00:15</span>
        <span className="home-preview-resolution">1080 × 1920</span>
      </div>
      <div className="home-preview-frame home-preview-frame-video">
        <img src="/home-assets/video-workflow.jpg" alt="无限画布视频流程预览" className="home-preview-video-image" />
        <div className="home-preview-video-grid" />
        <svg className="home-preview-flow-line" viewBox="0 0 420 210" preserveAspectRatio="none" aria-hidden="true">
          <path d="M76 116 C128 116 132 64 178 64 S232 136 278 136 S326 88 374 88" />
        </svg>
        <div className="home-preview-node home-preview-node-a">
          <strong>商品素材</strong>
          <span />
        </div>
        <div className="home-preview-node home-preview-node-b">
          <strong>镜头生成</strong>
          <span />
        </div>
        <div className="home-preview-node home-preview-node-c">
          <strong>成片输出</strong>
          <span />
        </div>
        <div className="home-preview-timeline">
          <span />
          <span />
          <span />
          <i />
        </div>
      </div>
    </div>
  );
}

export function BrandGatewayPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const reduceMotion = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createProject = useProjectStore((state) => state.createProject);
  const heroTitle = useMemo(() => ["一套工作台", "完成商业内容生产"], []);

  function updateSpotlight(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  }

  async function beginPhotos(input = prompt) {
    const clean = input.trim() || "图文创作项目";
    clearCanvas();
    addNode("textGenerate", { x: 220, y: 150 });
    addNode("imageGenerate", { x: 700, y: 130 });
    const nodes = useCanvasStore.getState().nodes;
    const textNode = nodes.find((node) => node.type === "textGenerate");
    const imageNode = nodes.find((node) => node.type === "imageGenerate");
    if (textNode) updateNodeData(textNode.id, { title: "图文策划", prompt: clean, taskType: "prompt-polish" });
    if (imageNode) updateNodeData(imageNode.id, { title: "图像生成", prompt: clean, aspectRatio: "1:1", inputMode: "text-to-image" });
    if (textNode && imageNode) useCanvasStore.getState().connectNodes({ source: textNode.id, sourceHandle: "out", target: imageNode.id, targetHandle: "in-0" });

    try {
      const project = await createProject(clean.slice(0, 24));
      await useProjectStore.getState().saveProject(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
      onNavigate("canvas", project.id);
    } catch {
      onNavigate("canvas", "new");
    }
  }

  async function beginVideo(input = prompt) {
    const clean = input.trim() || "商业视频工作流";
    clearCanvas();
    addNode("image", { x: 220, y: 170 });
    addNode("video", { x: 690, y: 130 });
    const nodes = useCanvasStore.getState().nodes;
    const imageNode = nodes.find((node) => node.type === "image");
    const videoNode = [...nodes].reverse().find((node) => node.type === "video");
    if (videoNode) updateNodeData(videoNode.id, { title: "视频生成", prompt: clean, videoMode: "image_to_video", inputMode: "image-to-video" });
    if (imageNode && videoNode) useCanvasStore.getState().connectNodes({ source: imageNode.id, sourceHandle: "out", target: videoNode.id, targetHandle: "in-0" });

    try {
      const project = await createProject(clean.slice(0, 24));
      await useProjectStore.getState().saveProject(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
      onNavigate("canvas", project.id);
    } catch {
      onNavigate("canvas", "new");
    }
  }

  function submitPrompt() {
    const clean = prompt.trim();
    if (inferMode(clean) === "photos") void beginPhotos(clean);
    else void beginVideo(clean);
  }

  return (
    <motion.div
      className="studio-page home-gateway home-flagship-shell h-full overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
      onMouseMove={updateSpotlight}
    >
      <HomeLaunchIntro />
      <HomeTopNav page="home" onNavigate={onNavigate} />

      <main className="home-flagship-content">
        <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1480px] items-center gap-16 px-5 pb-24 pt-32 md:px-10 lg:grid-cols-[0.84fr_1.16fr]">
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}>
            <div className="home-eyebrow">
              <span className="h-px w-10 bg-white/18" />
              <span>Enterprise AIGC OS</span>
            </div>
            <h1 className="mt-8 max-w-[720px] text-[44px] font-black leading-[1.04] tracking-[-0.045em] text-white md:text-[68px] xl:text-[82px]">
              <span className="block">{heroTitle[0]}</span>
              <span className="block text-white/36">{heroTitle[1]}</span>
            </h1>
            <p className="mt-7 max-w-[650px] text-[16px] leading-8 text-white/48 md:text-[19px]">
              面向电商品牌、内容团队与专业创作者，统一完成商品主图、详情页、营销海报与短视频生产。客户只需要配置一次 API，图文与视频能力即可在同一套工作台中复用。
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <button type="button" className="studio-primary-button h-12 px-6" onClick={() => void beginPhotos()}>
                开始图文制作 <ArrowRight size={17} />
              </button>
              <button type="button" className="studio-secondary-button h-12 px-6" onClick={() => void beginVideo()}>
                进入视频工作流 <Video size={17} />
              </button>
            </div>
            <div className="mt-14 grid max-w-[700px] grid-cols-1 gap-6 border-t border-white/[0.07] pt-8 sm:grid-cols-3">
              {proofItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/22">
                      <Icon size={12} /> {item.label}
                    </div>
                    <div className="mt-3 text-[14px] font-semibold text-white/76">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            className="grid gap-7 xl:grid-cols-2"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
            initial="hidden"
            animate="show"
          >
            <motion.button
              type="button"
              onClick={() => void beginPhotos()}
              className="home-showcase-card group text-left"
              variants={fadeUp}
              transition={{ duration: 0.54, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduceMotion ? undefined : { y: -7 }}
            >
              <div className="home-showcase-cover home-showcase-cover-photos">
                <span className="home-showcase-icon"><Image size={28} /></span>
                <span className="home-showcase-chip">商品视觉生产</span>
                <ProductPreview type="photos" />
              </div>
              <div className="home-showcase-body">
                <div className="home-showcase-meta"><span>01</span><span /> <span>Commerce Image Studio</span></div>
                <div className="flex items-center justify-between gap-4">
                  <h2>电商图文工作台</h2>
                  <ArrowRight size={24} className="transition group-hover:translate-x-1" />
                </div>
                <p>从商品主图、详情页到营销海报，集中完成批量生成、视觉优化与多规格交付。</p>
              </div>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => void beginVideo()}
              className="home-showcase-card group text-left"
              variants={fadeUp}
              transition={{ duration: 0.54, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduceMotion ? undefined : { y: -7 }}
            >
              <div className="home-showcase-cover home-showcase-cover-video">
                <span className="home-showcase-icon"><Video size={28} /></span>
                <span className="home-showcase-chip">无限画布视频</span>
                <ProductPreview type="video" />
              </div>
              <div className="home-showcase-body">
                <div className="home-showcase-meta"><span>02</span><span /> <span>Video Workflow</span></div>
                <div className="flex items-center justify-between gap-4">
                  <h2>AI 视频工作流</h2>
                  <ArrowRight size={24} className="transition group-hover:translate-x-1" />
                </div>
                <p>串联脚本、素材、镜头与模型生成，让团队用可复用流程稳定产出商业短视频。</p>
              </div>
            </motion.button>
          </motion.div>
        </section>

        <section className="mx-auto max-w-[960px] px-5 py-24 text-center md:px-10">
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.54 }}>
            <h2 className="text-[36px] font-black tracking-[-0.035em] text-white md:text-[56px]">描述你的创意</h2>
            <p className="mt-4 text-[16px] text-white/38">输入一句话，自动生成可继续编辑的图文或视频画布</p>
            <div className="home-prompt-terminal mt-12">
              <div className="home-prompt-input">
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitPrompt();
                  }}
                  placeholder="把产品主图生成 15 秒竖屏电商短视频..."
                />
                <button type="button" onClick={submitPrompt} aria-label="开始生成画布">
                  <Send size={19} />
                </button>
              </div>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {quickPrompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setPrompt(item.prompt);
                      if (item.mode === "photos") void beginPhotos(item.prompt);
                      else void beginVideo(item.prompt);
                    }}
                    className="home-prompt-tag"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 py-24 md:px-10">
          <div className="mb-16 text-center">
            <h2 className="text-[34px] font-black tracking-[-0.02em] text-white md:text-[48px]">专业创作工具</h2>
            <p className="mt-4 text-[16px] text-white/40">一站式 AI 创作平台，覆盖图像、视频、素材与生产流程。</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {toolCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  className={`home-tool-card ${card.className}`}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ delay: index * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={`home-tool-accent bg-gradient-to-r ${card.accent}`} />
                  <span className="home-tool-icon"><Icon size={24} /></span>
                  {card.stat ? (
                    <div className="mt-12">
                      <div className="text-[70px] font-black leading-none tracking-[-0.07em] text-white">{card.stat}</div>
                      <h3 className="mt-4 text-[18px] font-semibold text-white/88">{card.title}</h3>
                      <p className="mt-3 text-[14px] leading-7 text-white/42">{card.desc}</p>
                    </div>
                  ) : (
                    <div className="mt-16">
                      <h3 className="text-[24px] font-black text-white">{card.title}</h3>
                      <p className="mt-5 max-w-[720px] text-[15px] leading-7 text-white/48">{card.desc}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="home-flagship-footer">
        <div className="mx-auto max-w-[1380px] px-5 py-16 md:px-10">
          <div className="grid gap-10 border-y border-white/[0.07] py-14 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="text-[24px] font-black text-white">AIGC | 创作平台</div>
              <p className="mt-5 max-w-[380px] text-[14px] leading-7 text-white/34">
                AI 驱动的商业内容生产平台。编辑文本、图像、视频与素材流程，让团队把创意稳定变成可交付资产。
              </p>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white/78">支持</div>
              <div className="mt-5 grid gap-4 text-[14px] text-white/32">
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">帮助中心</button>
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">联系我们</button>
              </div>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white/78">关于</div>
              <div className="mt-5 grid gap-4 text-[14px] text-white/32">
                <a href="/terms" className="w-fit transition hover:text-white/70">服务条款</a>
                <a href="/privacy" className="w-fit transition hover:text-white/70">隐私政策</a>
              </div>
            </div>
          </div>

          <div className="py-10 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[16px] font-semibold text-white/80">
              <a href="/privacy" className="transition hover:text-white">隐私政策</a>
              <span className="text-white/28">·</span>
              <a href="/terms" className="transition hover:text-white">服务条款</a>
            </div>
            <div className="mt-7 text-[15px] font-semibold text-white/46">
              版权所有—{STUDIO_NAME} 保留所有权利
            </div>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block text-[13px] font-semibold tracking-[0.12em] text-white/26 transition hover:text-white/62"
            >
              {ICP_RECORD}
            </a>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-8 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/24 md:flex-row md:items-center md:justify-between">
            <span>© 2026 AIGCNONG</span>
            <span>imagephotos.asia</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
