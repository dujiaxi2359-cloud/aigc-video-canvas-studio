import { forwardRef, type SyntheticEvent, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...props }, ref) {
  const stop = (event: SyntheticEvent<HTMLTextAreaElement>) => event.stopPropagation();

  return (
    <textarea
      ref={ref}
      className={`nodrag nopan nowheel relative z-[2] w-full resize-none rounded-[8px] border border-white/[0.1] bg-[#141414] px-3 py-3 text-[13px] leading-5 text-[#f3f5f7] outline-none transition placeholder:text-[#6e7786] hover:border-white/[0.2] focus:border-cyan-200/50 focus:shadow-[0_0_0_3px_rgba(103,232,249,0.1)] ${className}`}
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
});
