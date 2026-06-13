import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientCacheReset } from "@/app/client-cache-reset";
import { HydrationErrorFilter } from "@/app/hydration-error-filter";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIGC_NONG | AIGC设计图工作台",
  description:
    "面向电商产品图、详情图套图、海报图和参考图模仿的 AIGC 设计工作台。",
  other: {
    google: "notranslate",
  },
};

const legalLinks = [
  { href: "/privacy", label: "隐私政策" },
  { href: "/terms", label: "服务条款" }
];

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" translate="no" suppressHydrationWarning>
      <body translate="no" suppressHydrationWarning>
        <HydrationErrorFilter />
        <ClientCacheReset />
        {children}
        <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-5 pb-4">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1 border-t border-white/[0.06] pt-3 text-center text-[11px] leading-5 text-white/36">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {legalLinks.map((link) => (
                <a key={link.href} href={link.href} className="pointer-events-auto transition hover:text-white/72">
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="tracking-[0.08em] text-white/46">AIGCNONG个人工作室</span>
              <span className="hidden h-3 w-px bg-white/[0.12] sm:block" />
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto transition hover:text-white/72"
              >
                粤ICP备2026074382号
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
