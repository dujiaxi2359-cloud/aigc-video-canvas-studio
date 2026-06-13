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
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  Video,
  type LucideIcon
} from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";

const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "AIGCNONG个人工作室";

const productAreas: Array<{
  page: Page;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  preview: string;
  metric: string;
}> = [
  {
    page: "photos",
    title: "电商图文工作台",
    subtitle: "从商品主图、详情页到营销海报，集中完成批量生成、视觉优化与多规格交付。",
    icon: Image,
    preview: "Commerce Image Studio",
    metric: "商品视觉生产"
  },
  {
    page: "video",
    title: "AI 视频工作流",
    subtitle: "串联脚本、素材、镜头与模型生成，让团队用可复用流程稳定产出商业短视频。",
    icon: Video,
    preview: "Video Workflow",
    metric: "智能视频生产"
  }
];

const featureCards: Array<{
  title: string;
  desc: string;
  icon: LucideIcon;
  className: string;
  accent: string;
  stat?: string;
  visual?: "photos" | "video";
}> = [
  {
    title: "商业视频工作流",
    desc: "从脚本拆解、镜头编排到字幕与成片导出，用可复用节点流程稳定完成内容生产。",
    icon: Clapperboard,
    className: "lg:col-span-3",
    accent: "from-[#6366f1] to-[#06b6d4]",
    visual: "video"
  },
  {
    title: "统一生产链路",
    desc: "图文、视频、素材与模型配置在同一空间协作。",
    icon: Sparkles,
    className: "",
    accent: "from-[#ff6b35] to-[#f7c948]",
    stat: "1套"
  },
  {
    title: "商品视觉生成",
    desc: "完成背景替换、场景延展、产品主图和详情页素材生成。",
    icon: Image,
    className: "",
    accent: "from-[#6366f1] to-[#06b6d4]",
    visual: "photos"
  },
  {
    title: "品牌模板体系",
    desc: "沉淀品牌字体、色彩与版式规范，让批量内容保持一致。",
    icon: Palette,
    className: "",
    accent: "from-[#10b981] to-[#34d399]"
  },
  {
    title: "可复用生产流程",
    desc: "通过可视化节点连接模型与素材，支持批量处理、自动化和团队复用。",
    icon: Link2,
    className: "lg:col-span-2",
    accent: "from-[#ec4899] to-[#f43f5e]",
    visual: "video"
  }
];

const promptTags = ["电商主图", "产品视频", "图生视频", "短剧分镜"];

const platformProof = [
  { icon: ShieldCheck, label: "一次配置", value: "统一 API 能力" },
  { icon: Database, label: "集中管理", value: "素材与项目资产" },
  { icon: UsersRound, label: "多人复用", value: "团队生产流程" }
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

function goToPhotos() {
  window.location.assign("/photos");
}

function ProductPreview({ type }: { type: "photos" | "video" }) {
  if (type === "photos") {
    return (
      <div className="product-preview-frame absolute inset-x-5 bottom-5 top-[72px] overflow-hidden rounded-[12px] border border-white/[0.11] bg-[#0b0d0f] shadow-[0_24px_60px_rgba(0,0,0,0.38)]">
        <div className="flex h-8 items-center border-b border-white/[0.07] bg-white/[0.035] px-3">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff7867]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#f3c969]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#6acb91]" />
          </div>
          <span className="ml-3 text-[8px] font-medium text-white/38">商品主图 · 1:1</span>
          <span className="ml-auto rounded bg-[#67d6c0]/12 px-1.5 py-0.5 text-[7px] text-[#89e2d0]">已同步</span>
        </div>
        <div className="grid h-[calc(100%-32px)] grid-cols-[28px_1fr_62px]">
          <div className="flex flex-col items-center gap-2 border-r border-white/[0.06] bg-white/[0.02] py-3">
            {[Image, Palette, Sparkles].map((Tool, index) => (
              <Tool key={index} size={10} className={index === 0 ? "text-white" : "text-white/28"} />
            ))}
          </div>
          <div className="relative m-3 overflow-hidden rounded-[8px] bg-[#171918]">
            <img
              src="/home-assets/commerce-image-studio.jpg"
              alt="电商商品主图与详情页素材制作预览"
              className="h-full w-full object-cover object-center saturate-[0.82]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,10,.02),rgba(8,10,10,.2))]" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[6px] font-medium text-white/72 backdrop-blur-md">
              <span className="h-1 w-1 rounded-full bg-[#7ad3c1]" /> 主图与详情页素材
            </div>
          </div>
          <div className="border-l border-white/[0.06] p-2">
            <div className="flex items-center gap-1 text-[7px] text-white/48"><SlidersHorizontal size={8} />属性</div>
            <div className="mt-3 space-y-2">
              {[72, 54, 82].map((width) => (
                <div key={width} className="h-1 rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-[#6ccdbb]" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1">
              {["#dce7e1", "#76b9ad", "#25292b"].map((color) => (
                <span key={color} className="aspect-square rounded-[3px] border border-white/10" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="product-preview-frame absolute inset-x-5 bottom-5 top-[72px] overflow-hidden rounded-[12px] border border-white/[0.11] bg-[#0b0d0f] shadow-[0_24px_60px_rgba(0,0,0,0.38)]">
      <div className="flex h-8 items-center border-b border-white/[0.07] bg-white/[0.035] px-3">
        <Play size={9} className="text-[#ff9a6b]" />
        <span className="ml-2 text-[8px] font-medium text-white/38">商品短视频 · 00:15</span>
        <span className="ml-auto text-[7px] text-white/25">1080 × 1920</span>
      </div>
      <div className="relative h-[calc(100%-68px)] overflow-hidden bg-[#090b0c]">
        <img
          src="/home-assets/video-workflow.jpg"
          alt="商品视频分镜与剪辑流程预览"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-45 saturate-[0.75]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,8,.78),rgba(5,7,8,.34)_45%,rgba(5,7,8,.72)),linear-gradient(180deg,rgba(5,7,8,.14),rgba(5,7,8,.64))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:18px_18px]" />
        <svg className="absolute inset-0 h-full w-full text-white/15" viewBox="0 0 300 130" preserveAspectRatio="none" aria-hidden="true">
          <path d="M64 67 C92 67 89 35 118 35 S151 78 177 78 S205 49 235 49" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div className="absolute left-[8%] top-[40%] w-[25%] rounded-[7px] border border-[#68c8b7]/38 bg-[#14201f] p-2">
          <div className="text-[7px] font-medium text-[#8de0d0]">商品素材</div>
          <div className="mt-1 h-5 rounded bg-[#6dbbae]/20" />
        </div>
        <div className="absolute left-[38%] top-[16%] w-[25%] rounded-[7px] border border-[#f29b6b]/38 bg-[#211916] p-2">
          <div className="text-[7px] font-medium text-[#f5b28c]">镜头生成</div>
          <div className="mt-1.5 h-1 rounded bg-white/10" />
        </div>
        <div className="absolute right-[6%] top-[48%] w-[25%] rounded-[7px] border border-[#8c9ee8]/38 bg-[#171927] p-2">
          <div className="text-[7px] font-medium text-[#b2bdf1]">成片输出</div>
          <div className="mt-1.5 h-1 rounded bg-white/10" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-9 border-t border-white/[0.07] bg-[#0e1012] px-3 py-2">
        <div className="relative h-2 rounded-sm bg-white/[0.05]">
          <div className="absolute inset-y-0 left-[4%] w-[36%] rounded-sm bg-[#65b9ab]/55" />
          <div className="absolute inset-y-0 left-[42%] w-[25%] rounded-sm bg-[#ef9367]/55" />
          <div className="absolute inset-y-0 left-[69%] right-[5%] rounded-sm bg-[#7e8fd5]/55" />
          <div className="absolute -bottom-1 -top-1 left-[58%] w-px bg-white" />
        </div>
      </div>
    </div>
  );
}

export function BrandGatewayPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="studio-page home-gateway h-full overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
    >
      <HomeTopNav page="home" onNavigate={onNavigate} />
      <main>
        <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1320px] items-center gap-12 px-5 pb-16 pt-28 md:px-10 lg:grid-cols-[0.82fr_1.18fr]">
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white/58 shadow-[0_16px_70px_rgba(0,0,0,0.26)] backdrop-blur-xl">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#79d8c5] opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8ce4d2]" />
              </span>
              面向商业内容团队
            </div>
            <h1 className="mt-6 max-w-[660px] text-[42px] font-semibold leading-[1.04] text-white md:text-[54px] 2xl:text-[60px]">
              <span className="block">一套工作台</span>
              <span className="mt-1 block">完成商业内容生产</span>
            </h1>
            <p className="mt-5 max-w-[560px] text-[15px] leading-7 text-white/52">
              面向电商品牌、内容团队与专业创作者，统一完成商品主图、详情页、营销海报与短视频生产。模型、素材和项目资产集中管理，减少重复配置与跨工具协作。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="studio-primary-button h-11 px-5" onClick={goToPhotos}>
                开始图文制作 <ArrowRight size={16} />
              </button>
              <button type="button" className="studio-secondary-button h-11 px-5" onClick={() => onNavigate("video")}>
                进入视频工作流 <Video size={16} />
              </button>
            </div>
            <div className="mt-9 grid max-w-[560px] grid-cols-3 border-y border-white/[0.07] py-4">
              {platformProof.map((item, index) => {
                const ProofIcon = item.icon;
                return (
                  <div key={item.value} className={`min-w-0 ${index > 0 ? "border-l border-white/[0.07] pl-4 md:pl-5" : "pr-3"}`}>
                    <div className="flex items-center gap-1.5 text-[10px] text-white/31"><ProofIcon size={11} />{item.label}</div>
                    <div className="mt-1.5 truncate text-[11px] font-medium text-white/68 md:text-[12px]">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            className="grid gap-4 md:grid-cols-2"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
            initial="hidden"
            animate="show"
          >
            {productAreas.map((area) => {
              const Icon = area.icon;
              return (
                <motion.button
                  key={area.page}
                  type="button"
                  onClick={() => area.page === "photos" ? goToPhotos() : onNavigate(area.page)}
                  className="product-launch-card group overflow-hidden rounded-[16px] border border-white/[0.1] bg-[#111114]/78 text-left shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                  variants={fadeUp}
                  transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                >
                  <div className={`relative aspect-[4/3] overflow-hidden ${area.page === "photos" ? "bg-[#172321]" : "bg-[#201916]"}`}>
                    <div className={`absolute inset-x-0 top-0 h-24 opacity-75 ${area.page === "photos" ? "bg-[linear-gradient(115deg,#143a36,#47766f,#998f79)]" : "bg-[linear-gradient(115deg,#22263d,#625361,#9c654c)]"}`} />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                    <div className="absolute left-5 top-5 grid h-11 w-11 place-items-center rounded-[11px] border border-white/20 bg-black/18 text-white backdrop-blur-md">
                      <Icon size={20} />
                    </div>
                    <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] text-white/68 backdrop-blur-md">
                      {area.metric}
                    </div>
                    <ProductPreview type={area.page === "photos" ? "photos" : "video"} />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.08),transparent_35%,rgba(0,0,0,.12))]" />
                  </div>
                  <div className="p-5">
                    <div className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase text-white/27">
                      <span>{area.page === "photos" ? "01" : "02"}</span>
                      <span className="h-px flex-1 bg-white/[0.07]" />
                      <span>{area.preview}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-[21px] font-semibold text-white">{area.title}</h2>
                      <ArrowRight size={17} className="text-white/34 transition group-hover:translate-x-1 group-hover:text-white" />
                    </div>
                    <p className="mt-2 min-h-[48px] text-[13px] leading-6 text-white/45">{area.subtitle}</p>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </section>

        <section className="border-y border-white/[0.055] bg-white/[0.012] px-5 py-5 md:px-10">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-9 gap-y-3 text-[10px] font-medium uppercase text-white/24 md:justify-between md:text-[11px]">
            {["IMAGE COMMERCE", "VIDEO WORKFLOW", "MODEL ROUTING", "ASSET SYSTEM", "TEAM PRODUCTION"].map((item) => (
              <span key={item} className="flex items-center gap-2"><Check size={11} className="text-[#72cdbb]/65" />{item}</span>
            ))}
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:px-10 md:py-24">
          <div className="mx-auto max-w-[1200px]">
            <motion.div
              className="mb-12 text-center"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-[34px] font-semibold leading-tight text-white md:text-[48px]">专业创作工具</h2>
              <p className="mt-3 text-[15px] text-white/45 md:text-[16px]">为团队建立从商品视觉到商业视频的统一生产流程。</p>
            </motion.div>

            <div className="grid gap-3 lg:grid-cols-4">
              {featureCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.title}
                    className={`feature-system-card relative min-h-[200px] overflow-hidden rounded-[14px] border border-white/[0.09] bg-[#101113]/88 p-6 ${card.className}`}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ delay: index * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={reduceMotion ? undefined : { y: -3 }}
                  >
                    <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${card.accent} opacity-80`} />
                    {card.visual && (
                      <>
                        <img
                          src={card.visual === "photos" ? "/home-assets/commerce-image-studio.jpg" : "/home-assets/video-workflow.jpg"}
                          alt=""
                          aria-hidden="true"
                          className="feature-card-visual absolute inset-y-0 right-0 h-full w-[56%] object-cover opacity-[0.15]"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,#101113_28%,rgba(16,17,19,.91)_52%,rgba(16,17,19,.56))]" />
                      </>
                    )}
                    <div className="relative grid h-11 w-11 place-items-center rounded-[12px] border border-white/[0.09] bg-white/[0.05] text-white/78">
                      <Icon size={19} />
                    </div>
                    {card.stat ? (
                      <>
                        <div className="relative mt-7 text-[54px] font-semibold leading-none text-white">{card.stat}</div>
                        <div className="relative mt-2 text-[13px] text-white/38">{card.title}</div>
                      </>
                    ) : (
                      <>
                        <h3 className="relative mt-7 text-[19px] font-semibold text-white">{card.title}</h3>
                        <p className="relative mt-3 max-w-[720px] text-[13px] leading-6 text-white/43">{card.desc}</p>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:px-10 md:py-24">
          <motion.div
            className="mx-auto max-w-[880px] text-center"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[34px] font-semibold leading-tight text-white md:text-[48px]">描述你的创意</h2>
            <p className="mt-3 text-[15px] text-white/45 md:text-[16px]">AI 帮你实现</p>
            <div className="mt-12 rounded-[22px] border border-white/[0.09] bg-[#111114]/78 p-6 shadow-[0_28px_110px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-8">
              <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.09] bg-black/38 p-3">
                <input
                  className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-white outline-none placeholder:text-white/22"
                  placeholder="把产品主图生成 15 秒竖屏电商短视频..."
                />
                <button type="button" onClick={() => onNavigate("video")} className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-white text-black transition hover:scale-[0.98]">
                  <Send size={17} />
                </button>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {promptTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => onNavigate("video")} className="rounded-full border border-white/[0.08] bg-black/24 px-4 py-2 text-[13px] text-white/34 transition hover:border-white/[0.18] hover:text-white/72">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-24 text-center md:px-10 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[36px] font-semibold leading-tight text-white md:text-[48px]">开始创作</h2>
            <p className="mt-4 text-[16px] text-white/42">为你的商业内容建立稳定、可复用的生产流程</p>
            <button type="button" onClick={goToPhotos} className="mt-9 rounded-full bg-white px-9 py-3.5 text-[15px] font-semibold text-black transition hover:-translate-y-0.5 hover:bg-white/90">
              免费开始
            </button>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-5 py-12 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <div className="text-[18px] font-semibold text-white">AIGC｜创作平台</div>
              <p className="mt-4 max-w-[300px] text-[13px] leading-6 text-white/28">
                面向商业团队的 AI 内容生产平台，统一管理图文、视频、素材与模型能力。
              </p>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white/78">支持</div>
              <div className="mt-4 grid gap-3 text-[13px] text-white/30">
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">帮助中心</button>
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">联系我们</button>
              </div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white/78">关于</div>
              <div className="mt-4 grid gap-3 text-[13px] text-white/30">
                <a href="/terms" className="w-fit transition hover:text-white/70">服务条款</a>
                <a href="/privacy" className="w-fit transition hover:text-white/70">隐私政策</a>
              </div>
            </div>
          </div>

          <div className="mt-14 border-t border-white/[0.07] pt-9 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px] font-semibold text-white/72">
              <a href="/privacy" className="transition hover:text-white">隐私政策</a>
              <span className="text-white/28">·</span>
              <a href="/terms" className="transition hover:text-white">服务条款</a>
            </div>
            <div className="mt-4 text-[14px] font-semibold text-white/48">
              版权所有—{STUDIO_NAME} 保留所有权利
            </div>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-[12px] font-medium text-white/24 transition hover:text-white/60"
            >
              {ICP_RECORD}
            </a>
          </div>

          <div className="mt-9 flex flex-col gap-2 border-t border-white/[0.07] pt-6 text-[12px] text-white/24 md:flex-row md:items-center md:justify-between">
            <span>© 2026 AIGCNONG</span>
            <span>imagephotos.asia</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
