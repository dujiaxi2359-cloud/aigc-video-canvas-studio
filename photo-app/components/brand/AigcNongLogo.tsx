"use client";

type AigcNongLogoVariant = "hub" | "sidebar" | "compact";

type AigcNongLogoProps = {
  variant?: AigcNongLogoVariant;
  className?: string;
};

const sizeMap: Record<
  AigcNongLogoVariant,
  {
    wrap: string;
    mark: string;
    name: string;
    subtitle: string;
    hover: string;
    align: string;
  }
> = {
  hub: {
    wrap: "gap-4",
    mark: "text-6xl md:text-7xl",
    name: "text-sm tracking-[0.65em]",
    subtitle: "text-[10px] tracking-[0.45em]",
    hover: "hover:scale-110",
    align: "items-center text-center",
  },
  sidebar: {
    wrap: "gap-2",
    mark: "text-3xl",
    name: "text-[11px] tracking-[0.28em]",
    subtitle: "text-[8px] tracking-[0.22em]",
    hover: "hover:scale-105",
    align: "items-start text-left",
  },
  compact: {
    wrap: "gap-1.5",
    mark: "text-2xl",
    name: "text-[10px] tracking-[0.22em]",
    subtitle: "hidden",
    hover: "hover:scale-105",
    align: "items-start text-left",
  },
};

export function AigcNongLogo({ variant = "sidebar", className = "" }: AigcNongLogoProps) {
  const size = sizeMap[variant];

  return (
    <div
      className={`group relative inline-flex ${size.align} ${size.wrap} origin-center transition-transform duration-500 ease-out ${size.hover} ${className}`}
    >
      {variant === "hub" && (
        <div
          className="absolute left-1/2 top-1/2 -z-10 h-28 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-3xl opacity-70 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
      <div className={`${size.mark} font-black italic leading-none tracking-[-0.08em]`}>
        <span className="text-white">A</span>
        <span className="bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(99,102,241,0.35)]">
          N
        </span>
      </div>
      <div className={`${size.name} font-black uppercase leading-none text-white`}>AIGC_NONG</div>
      <div className={`${size.subtitle} bg-gradient-to-r from-zinc-500 via-indigo-300 to-zinc-600 bg-clip-text font-bold uppercase leading-none text-transparent`}>
        PREMIUM AI DESIGN ENGINE
      </div>
    </div>
  );
}
