import Link from "next/link";

const legalInfo = {
  privacy: {
    title: "隐私政策",
    subtitle: "这里将放置 AIGCNONG 对账号信息、API 配置、素材与生成记录的收集、使用和保护说明。"
  },
  terms: {
    title: "服务条款",
    subtitle: "这里将放置 AIGCNONG 的使用规则、账号权限、服务边界、付费与责任说明。"
  }
} as const;

export type LegalSlug = keyof typeof legalInfo;

export function LegalContent({ slug }: { slug: LegalSlug }) {
  const info = legalInfo[slug];

  return (
    <main className="studio-shell grid min-h-screen place-items-center px-6 py-24 text-center">
      <section className="relative z-10 w-full max-w-2xl border-t border-white/[0.08] pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-white/34">AIGCNONG Legal</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">{info.title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-7 text-white/48">{info.subtitle}</p>
        <div className="mx-auto mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-6 py-5 text-left text-[13px] leading-7 text-white/48">
          正式内容正在整理中。上线前请根据实际业务、API 服务商、用户数据处理方式和内容审核规则补充完整文本。
        </div>
        <Link href="/photos" className="studio-secondary-button mx-auto mt-7">
          返回图文创作
        </Link>
      </section>
    </main>
  );
}
