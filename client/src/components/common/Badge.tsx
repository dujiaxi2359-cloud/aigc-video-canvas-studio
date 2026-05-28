export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-white/[0.06] bg-white/[0.05] px-2 text-[11px] font-medium text-[#cdd4de]">
      {children}
    </span>
  );
}
