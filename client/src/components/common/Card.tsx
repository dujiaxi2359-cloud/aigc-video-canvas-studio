export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/[0.08] bg-[#151922]/[0.92] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.28)] ${className}`}>{children}</div>;
}
