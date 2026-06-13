const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "AIGCNONG个人工作室";
const LEGAL_LINKS = [
  { href: "/privacy", label: "隐私政策" },
  { href: "/terms", label: "服务条款" }
];

export function IcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 px-5 pb-7 ${className}`}>
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-center gap-2 text-center font-semibold tracking-[0.01em] text-white/34">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-6 text-white/42">
          {LEGAL_LINKS.map((link, index) => (
            <span key={link.href} className="inline-flex items-center gap-x-2">
              {index > 0 && <span className="text-white/22">·</span>}
              <a href={link.href} className="pointer-events-auto transition hover:text-white/74">
                {link.label}
              </a>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-6 text-white/36">
          <span>版权所有 ©2025-2026 {STUDIO_NAME} 保留所有权利</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-5 text-white/26">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto transition hover:text-white/62"
          >
            {ICP_RECORD}
          </a>
        </div>
      </div>
    </footer>
  );
}
