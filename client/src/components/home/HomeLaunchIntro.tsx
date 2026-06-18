import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized?: boolean;
      init?: () => void;
    };
  }
}

const UNICORN_SCRIPT_ID = "unicorn-studio-runtime";
const UNICORN_SCRIPT_SRC = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.5/dist/unicornStudio.umd.js";

export function HomeLaunchIntro() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!visible || reduceMotion || mountedRef.current) return;
    mountedRef.current = true;

    const init = () => window.UnicornStudio?.init?.();
    const runWhenReady = () => {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
      else init();
    };

    if (window.UnicornStudio?.init) {
      runWhenReady();
      return;
    }

    window.UnicornStudio = window.UnicornStudio || { isInitialized: false };
    const existing = document.getElementById(UNICORN_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", runWhenReady, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = UNICORN_SCRIPT_ID;
    script.src = UNICORN_SCRIPT_SRC;
    script.async = true;
    script.onload = runWhenReady;
    (document.head || document.body).appendChild(script);
  }, [reduceMotion, visible]);

  if (!visible || reduceMotion) return null;

  return (
    <motion.div
      className="home-launch-intro"
      initial={{ y: 0 }}
      animate={{ y: "-100%" }}
      transition={{ delay: 4.65, duration: 0.95, ease: [0.87, 0, 0.13, 1] }}
      onAnimationComplete={() => setVisible(false)}
      aria-hidden="true"
    >
      <div className="home-launch-unicorn-stage">
        <div className="home-launch-unicorn-embed" data-us-project="BH2HrNlrVEIa8nJ2cvvA" />
      </div>
    </motion.div>
  );
}
