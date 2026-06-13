import type { ButtonHTMLAttributes, SyntheticEvent } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-cyan-100/20 bg-cyan-300 text-black shadow-[0_8px_22px_rgba(34,211,238,0.16)] hover:bg-cyan-200",
  secondary:
    "border-white/[0.08] bg-white/[0.03] text-[#eef2f7] hover:bg-white/[0.06] hover:border-white/[0.12]",
  ghost:
    "border-transparent bg-transparent text-[#cbd4df] hover:bg-white/[0.04] hover:text-white",
  danger:
    "border-red-300/[0.16] bg-red-400/[0.08] text-red-200 hover:bg-red-400/[0.12] hover:border-red-300/[0.24]"
};

export function Button({
  className = "",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const stop = (event: SyntheticEvent<HTMLButtonElement>) => event.stopPropagation();

  return (
    <button
      className={`nodrag nopan nowheel inline-flex h-[34px] items-center justify-center gap-2 rounded-[8px] border px-3.5 text-[13px] font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
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
