import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MoonLogo } from "../common/BrandIdentity";

export function HomeLaunchIntro() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  if (!visible || reduceMotion) return null;

  return (
    <motion.div
      className="home-launch-intro"
      initial={{ y: 0 }}
      animate={{ y: "-100%" }}
      transition={{ delay: 3.35, duration: 1.05, ease: [0.87, 0, 0.13, 1] }}
      onAnimationComplete={() => setVisible(false)}
      aria-hidden="true"
    >
      <div className="home-launch-noise" />
      <motion.div
        className="home-launch-glow"
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1.12 }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="home-launch-content">
        <div className="home-launch-brand">
          <motion.span
            className="home-launch-mark"
            initial={{ opacity: 0, x: -18, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.58, duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <MoonLogo className="home-launch-logo" />
          </motion.span>
          <motion.span
            className="home-launch-wordmark"
            initial={{ opacity: 0, x: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ delay: 1.28, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          >
            Moon｜Tv
          </motion.span>
        </div>
        <motion.div
          className="home-launch-status"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.46, y: 0 }}
          transition={{ delay: 2.05, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          CREATIVE PRODUCTION OS
        </motion.div>
      </div>
    </motion.div>
  );
}
