const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "AIGCNONG个人工作室";

export function IcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 px-5 pb-4 ${className}`}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/[0.06] pt-3 text-center text-[11px] leading-5 text-white/34">
        <span className="tracking-[0.08em] text-white/44">{STUDIO_NAME}</span>
        <span className="hidden h-3 w-px bg-white/[0.12] sm:block" />
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto transition hover:text-white/70"
        >
          {ICP_RECORD}
        </a>
      </div>
    </footer>
  );
}
