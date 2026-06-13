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
        <footer className="pointer-events-none fixed inset-x-0 bottom-3 z-[90] flex justify-center px-4">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto rounded-full border border-white/[0.08] bg-black/35 px-3 py-1.5 text-[11px] text-white/40 backdrop-blur-md transition hover:border-white/[0.16] hover:text-white/72"
          >
            粤ICP备2026074382号
          </a>
        </footer>
      </body>
    </html>
  );
}
