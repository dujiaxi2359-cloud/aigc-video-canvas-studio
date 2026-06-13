const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "AIGCNONG个人工作室";
const LEGAL_LINKS = [
  { href: "/privacy", label: "隐私政策" },
  { href: "/terms", label: "服务条款" }
];

export function IcpFooter({
  className = "",
  mode = "fixed"
}: {
  className?: string;
  mode?: "fixed" | "flow";
}) {
  const shellClass = mode === "fixed"
    ? `pointer-events-none fixed inset-x-0 bottom-0 z-50 px-5 pb-5 ${className}`
    : `pointer-events-none px-5 pb-24 pt-16 ${className}`;

  return (
    <footer className={shellClass}>
      <div className="mx-auto flex max-w-[980px] flex-col items-center justify-center text-center">
        <div className="mb-8 h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] font-semibold leading-6 tracking-[0.02em] text-white/42">
          {LEGAL_LINKS.map((link, index) => (
            <span key={link.href} className="inline-flex items-center gap-x-3">
              {index > 0 && <span className="text-white/22">·</span>}
              <a href={link.href} className="pointer-events-auto transition hover:text-white/76">
                {link.label}
              </a>
            </span>
          ))}
        </div>
        <div className="mt-3 text-[13px] font-semibold leading-6 tracking-[0.01em] text-white/50">
          版权所有—{STUDIO_NAME} 保留所有权利
        </div>
        <div className="mt-3">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto text-[11px] font-medium leading-5 tracking-[0.02em] text-white/30 transition hover:text-white/66"
          >
            {ICP_RECORD}
          </a>
        </div>
      </div>
    </footer>
  );
}
