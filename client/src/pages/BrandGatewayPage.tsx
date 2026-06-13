import { motion } from "framer-motion";
import { ArrowRight, FolderOpen, Image, Sparkles, Video } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";

const productAreas: Array<{
  page: Page;
  title: string;
  subtitle: string;
  icon: typeof Image;
  tone: string;
  preview: string;
}> = [
  {
    page: "photos",
    title: "图文创作",
    subtitle: "商品图、主图、详情页素材和视觉文案集中生产。",
    icon: Image,
    tone: "from-[#1f5b68] via-[#6fa4a2] to-[#d4c6a1]",
    preview: "Image Studio"
  },
  {
    page: "video",
    title: "视频画布",
    subtitle: "用节点工作流把图片、脚本、音频和视频生成串起来。",
    icon: Video,
    tone: "from-[#3a315d] via-[#7b6aa9] to-[#d5aac4]",
    preview: "Video Canvas"
  }
];

export function BrandGatewayPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  return (
    <motion.div className="studio-page min-h-full overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <HomeTopNav page="home" onNavigate={onNavigate} />
      <main className="mx-auto max-w-[1240px] px-5 pb-16 pt-28 md:px-10">
        <section className="grid min-h-[calc(100vh-150px)] items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white/52">
              <Sparkles size={14} />
              AIGCNONG 创作工作台
            </div>
            <h1 className="mt-6 max-w-[620px] text-[42px] font-semibold leading-[1.06] text-white md:text-[64px]">
              一个入口管理图文和视频创作
            </h1>
            <p className="mt-5 max-w-[560px] text-[15px] leading-7 text-white/48">
              imagephotos.asia 作为主品牌首页，下面分成图文创作和视频画布两个功能区。团队、素材、历史记录和项目空间继续复用同一套账号与资源。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="studio-primary-button h-11 px-5" onClick={() => window.location.assign("/photos")}>
                进入图文创作 <ArrowRight size={16} />
              </button>
              <button type="button" className="studio-secondary-button h-11 px-5" onClick={() => onNavigate("video")}>
                打开视频画布 <Video size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {productAreas.map((area) => {
              const Icon = area.icon;
              return (
                <button
                  key={area.page}
                  type="button"
                  onClick={() => area.page === "photos" ? window.location.assign("/photos") : onNavigate(area.page)}
                  className="group overflow-hidden rounded-[10px] border border-white/[0.1] bg-white/[0.045] text-left shadow-[0_24px_90px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:border-white/[0.22] hover:bg-white/[0.07]"
                >
                  <div className={`relative aspect-[4/3] bg-gradient-to-br ${area.tone}`}>
                    <div className="absolute left-5 top-5 grid h-11 w-11 place-items-center rounded-[10px] border border-white/20 bg-black/18 text-white backdrop-blur-md">
                      <Icon size={20} />
                    </div>
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="rounded-[8px] border border-white/20 bg-black/20 p-4 text-white shadow-2xl backdrop-blur-md">
                        <div className="text-[11px] uppercase text-white/58">{area.preview}</div>
                        <div className="mt-2 h-2 w-3/4 rounded-full bg-white/44" />
                        <div className="mt-2 h-2 w-1/2 rounded-full bg-white/24" />
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.16),transparent_44%,rgba(0,0,0,.26))]" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-[20px] font-semibold text-white">{area.title}</h2>
                      <ArrowRight size={17} className="text-white/34 transition group-hover:translate-x-1 group-hover:text-white" />
                    </div>
                    <p className="mt-2 min-h-[48px] text-[13px] leading-6 text-white/45">{area.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 border-t border-white/[0.07] pt-8 md:grid-cols-3">
          <button type="button" onClick={() => onNavigate("workspace")} className="studio-secondary-button justify-start">
            <FolderOpen size={16} /> 项目空间
          </button>
          <button type="button" onClick={() => onNavigate("assets")} className="studio-secondary-button justify-start">
            <Image size={16} /> 素材库
          </button>
          <button type="button" onClick={() => onNavigate("settings")} className="studio-secondary-button justify-start">
            <Sparkles size={16} /> 设置中心
          </button>
        </section>
      </main>
    </motion.div>
  );
}
