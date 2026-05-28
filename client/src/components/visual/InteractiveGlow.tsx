import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

export function InteractiveGlow({ intensity = "dashboard" }: { intensity?: "dashboard" | "canvas" }) {
  const mouseX = useMotionValue(typeof window === "undefined" ? 0 : window.innerWidth / 2);
  const mouseY = useMotionValue(typeof window === "undefined" ? 0 : window.innerHeight / 2);
  const smoothX = useSpring(mouseX, { stiffness: 45, damping: 28, mass: 0.8 });
  const smoothY = useSpring(mouseY, { stiffness: 45, damping: 28, mass: 0.8 });
  const x = useTransform(smoothX, (value) => value - 340);
  const y = useTransform(smoothY, (value) => value - 340);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      mouseX.set(event.clientX);
      mouseY.set(event.clientY);
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      className="pointer-events-none fixed h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.16)_0%,rgba(59,130,246,0.07)_35%,transparent_70%)] blur-[90px]"
      style={{ x, y, opacity: intensity === "dashboard" ? 0.72 : 0.34, zIndex: 0 }}
    />
  );
}

