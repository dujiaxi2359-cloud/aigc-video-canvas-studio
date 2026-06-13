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
      </body>
    </html>
  );
}
