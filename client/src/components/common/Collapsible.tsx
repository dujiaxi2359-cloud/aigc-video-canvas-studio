import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.92]">
      <button
        type="button"
        className="flex h-12 w-full items-center justify-between px-4 text-left text-[14px] font-semibold text-[#f3f5f7]"
        onClick={() => setOpen((value) => !value)}
      >
        {title}
        <ChevronDown size={16} strokeWidth={1.8} className={`text-[#8b95a5] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-white/[0.06] p-4">{children}</div>}
    </div>
  );
}
