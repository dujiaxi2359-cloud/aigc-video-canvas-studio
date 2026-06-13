export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[8px] border border-white/[0.1] bg-[#1b1b1d]/[0.94] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.3)] ${className}`}>{children}</div>;
}
