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

function AnimatedWords({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`react-bits-split-text ${className}`} aria-label={text}>
      {text.split(" ").map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          aria-hidden="true"
          className="react-bits-split-word"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 + index * 0.05, duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

export function HomeLaunchIntro({ onFinish }: { onFinish?: () => void }) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const mountedRef = useRef(false);
  const completedRef = useRef(false);

  const completeIntro = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setVisible(false);
    onFinish?.();
  };

  useEffect(() => {
    if (reduceMotion) completeIntro();
  }, [reduceMotion]);

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
      transition={{ delay: 1.9, duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
      onAnimationComplete={completeIntro}
      aria-hidden="true"
    >
      <div className="home-launch-unicorn-stage">
        <div className="home-launch-unicorn-embed" data-us-project="BH2HrNlrVEIa8nJ2cvvA" />
      </div>
      <div className="home-launch-title-shield" />
      <div className="home-launch-copy">
        <AnimatedWords text="Where Ideas Become Motion." className="home-launch-headline" />
        <motion.div
          className="home-launch-subbrand"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          Moon | TV
        </motion.div>
      </div>
    </motion.div>
  );
}
