const ICP_RECORD = "粤ICP备2026074382号";

export function IcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4 ${className}`}>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto rounded-full border border-white/[0.08] bg-black/35 px-3 py-1.5 text-[11px] text-white/38 backdrop-blur-md transition hover:border-white/[0.16] hover:text-white/70"
      >
        {ICP_RECORD}
      </a>
    </footer>
  );
}
