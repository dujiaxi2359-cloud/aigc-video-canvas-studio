import type { Page } from "../../App";
import type { ReactNode } from "react";

export function AppLayout({
  page,
  onNavigate,
  children
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#050608] text-[#f3f5f7]" data-page={page}>
      <main className="h-full">{children}</main>
    </div>
  );
}
