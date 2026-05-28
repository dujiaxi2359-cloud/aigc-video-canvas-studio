import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import type { ReactNode } from "react";

export function SpotlightPortalBar({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const spotlightX = useMotionValue(320);
  const spotlightY = useMotionValue(34);
  const smoothX = useSpring(spotlightX, { stiffness: 130, damping: 26, mass: 0.6 });
  const smoothY = useSpring(spotlightY, { stiffness: 130, damping: 26, mass: 0.6 });
  const spotlight = useMotionTemplate`radial-gradient(220px circle at ${smoothX}px ${smoothY}px, rgba(139,92,246,0.32), rgba(56,189,248,0.10) 28%, transparent 42%)`;

  return (
    <motion.button
      type="button"
      layoutId="portal-bar"
      onClick={onClick}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        spotlightX.set(event.clientX - rect.left);
        spotlightY.set(event.clientY - rect.top);
      }}
      className="group relative z-10 flex h-[68px] w-full items-center gap-4 overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.02] px-5 text-left outline-none backdrop-blur-3xl transition hover:shadow-[0_0_20px_rgba(99,102,241,0.22)]"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
    >
      <motion.span className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ background: spotlight }} />
      <span className="pointer-events-none absolute inset-px rounded-[23px] bg-[#07070b]/70" />
      {children}
    </motion.button>
  );
}

