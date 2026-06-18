import { ArrowLeft } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useI18nStore } from "../i18n";

const legalInfo: Record<string, { title: string; subtitle: string }> = {
  privacy: {
    title: "隐私政策",
    subtitle: "这里将放置 Moon｜Tv 对账号信息、API 配置、素材与生成记录的收集、使用和保护说明。"
  },
  terms: {
    title: "服务条款",
    subtitle: "这里将放置 Moon｜Tv 的使用规则、账号权限、服务边界、付费与责任说明。"
  }
};

export function LegalPage({ page, onNavigate }: { page: Page; onNavigate: (page: Page, projectId?: string) => void }) {
  const t = useI18nStore((state) => state.t);
  const info = legalInfo[page] ?? legalInfo.privacy;
  const title = page === "terms" ? t("legal.termsTitle") : t("legal.privacyTitle");

  return (
    <div className="studio-page min-h-full">
      <HomeTopNav page="home" onNavigate={onNavigate} />
      <div className="grid min-h-screen place-items-center px-6 py-24">
        <section className="w-full max-w-2xl border-t border-white/[0.08] pt-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-white/34">Moon｜Tv Legal</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">{title || info.title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-7 text-white/48">{info.subtitle}</p>
          <div className="mx-auto mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-6 py-5 text-left text-[13px] leading-7 text-white/48">
            正式内容正在整理中。上线前请根据实际业务、API 服务商、用户数据处理方式和内容审核规则补充完整文本。
          </div>
          <button type="button" onClick={() => onNavigate("home")} className="studio-secondary-button mx-auto mt-7">
            <ArrowLeft size={15} /> {t("common.backHome")}
          </button>
        </section>
      </div>
    </div>
  );
}
