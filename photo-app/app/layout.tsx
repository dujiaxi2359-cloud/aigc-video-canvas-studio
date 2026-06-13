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
        <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-5 pb-7">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 text-center font-semibold tracking-[0.01em] text-white/34">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-6 text-white/42">
              {legalLinks.map((link, index) => (
                <span key={link.href} className="inline-flex items-center gap-x-2">
                  {index > 0 && <span className="text-white/22">·</span>}
                  <a href={link.href} className="pointer-events-auto transition hover:text-white/74">
                    {link.label}
                  </a>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-6 text-white/36">
              <span>版权所有 ©2025-2026 AIGCNONG个人工作室 保留所有权利</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-5 text-white/26">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto transition hover:text-white/62"
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
