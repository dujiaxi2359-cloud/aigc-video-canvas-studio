import type { SyntheticEvent, TextareaHTMLAttributes } from "react";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const stop = (event: SyntheticEvent<HTMLTextAreaElement>) => event.stopPropagation();

  return (
    <textarea
      className={`nodrag nopan nowheel relative z-[2] w-full resize-none rounded-[12px] border border-white/[0.08] bg-[#0f131a] px-3 py-3 text-[13px] leading-5 text-[#f3f5f7] outline-none transition placeholder:text-[#6e7786] hover:border-white/[0.14] focus:border-[#7c6cf6]/50 focus:shadow-[0_0_0_3px_rgba(124,108,246,0.12)] ${className}`}
      {...props}
      onPointerDown={(event) => {
        stop(event);
        props.onPointerDown?.(event);
      }}
      onMouseDown={(event) => {
        stop(event);
        props.onMouseDown?.(event);
      }}
      onClick={(event) => {
        stop(event);
        props.onClick?.(event);
      }}
      onKeyDown={(event) => {
        stop(event);
        props.onKeyDown?.(event);
      }}
    />
  );
}
