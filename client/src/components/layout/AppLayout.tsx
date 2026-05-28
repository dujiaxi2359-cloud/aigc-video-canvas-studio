import type { Page } from "../../App";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AddNodeMenu } from "../canvas/AddNodeMenu";
import { LeftSidebar } from "./LeftSidebar";
import { TopBar } from "./TopBar";

export function AppLayout({
  page,
  onNavigate,
  children
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}) {
  const [isAddNodeMenuOpen, setIsAddNodeMenuOpen] = useState(false);
  const [openAddMenuAfterCanvas, setOpenAddMenuAfterCanvas] = useState(false);

  const handleAddNodeClick = useCallback(() => {
    if (page !== "canvas") {
      setOpenAddMenuAfterCanvas(true);
      onNavigate("canvas");
      return;
    }
    setIsAddNodeMenuOpen((open) => !open);
  }, [onNavigate, page]);

  useEffect(() => {
    if (page !== "canvas" || !openAddMenuAfterCanvas) return;
    setOpenAddMenuAfterCanvas(false);
    setIsAddNodeMenuOpen(true);
  }, [openAddMenuAfterCanvas, page]);

  return (
    <div className="relative h-screen overflow-hidden bg-[#020203] text-[#f3f5f7]">
      {page !== "dashboard" && <TopBar />}
      {page !== "dashboard" && <LeftSidebar page={page} onNavigate={onNavigate} onAddNodeClick={handleAddNodeClick} />}
      <main className={`h-full ${page === "dashboard" ? "" : "pt-14"}`}>{children}</main>
      {page !== "dashboard" && <AddNodeMenu open={isAddNodeMenuOpen} onClose={() => setIsAddNodeMenuOpen(false)} />}
    </div>
  );
}
