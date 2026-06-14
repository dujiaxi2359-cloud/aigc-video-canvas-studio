type BrandIdentityProps = {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  showText?: boolean;
};

export function MoonLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <ellipse className="moon-logo-orbit" cx="50" cy="50" rx="45" ry="15" transform="rotate(-35 50 50)" />
      <path className="moon-logo-crescent" d="M65 20 A 32 32 0 1 0 65 80 A 26 26 0 1 1 65 20 Z" />
    </svg>
  );
}

export function BrandIdentity({ className = "", logoClassName = "", textClassName = "", showText = true }: BrandIdentityProps) {
  return (
    <span className={`brand-identity ${className}`}>
      <MoonLogo className={`brand-moon-logo ${logoClassName}`} />
      {showText && <span className={`brand-wordmark ${textClassName}`}>AIGC | 创作平台</span>}
    </span>
  );
}
