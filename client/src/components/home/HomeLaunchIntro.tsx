import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const launchBlocks = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  x: [5, 16, 29, 42, 55, 68, 82, 91, 11, 24, 37, 52, 64, 76, 88, 18, 47, 71][index],
  y: [19, 32, 24, 18, 35, 25, 20, 42, 50, 62, 55, 58, 48, 64, 58, 73, 78, 74][index],
  w: [12, 18, 14, 20, 16, 18, 13, 9, 16, 12, 18, 15, 13, 18, 12, 20, 14, 16][index],
  h: [5, 7, 6, 8, 6, 7, 5, 6, 7, 5, 8, 6, 5, 7, 5, 8, 6, 7][index]
}));

const launchDataPoints = [
  { left: "50.8%", top: "41.4%", value: "0.1647" },
  { left: "39.6%", top: "45.6%", value: "0.3686" },
  { left: "66.4%", top: "52.8%", value: "0.2745" }
];

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
  const [sceneReady, setSceneReady] = useState(false);
  const [minimumShown, setMinimumShown] = useState(false);
  const [canExit, setCanExit] = useState(false);
  const [completed, setCompleted] = useState(false);

  const completeIntro = () => {
    if (completed) return;
    setCompleted(true);
    setVisible(false);
    onFinish?.();
  };

  useEffect(() => {
    if (reduceMotion) completeIntro();
  }, [reduceMotion]);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const minimumTimer = window.setTimeout(() => setMinimumShown(true), 4600);
    return () => window.clearTimeout(minimumTimer);
  }, [reduceMotion, visible]);

  useEffect(() => {
    if (!visible || reduceMotion || !sceneReady || !minimumShown) return;
    setCanExit(true);
  }, [minimumShown, reduceMotion, sceneReady, visible]);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const frame = window.requestAnimationFrame(() => setSceneReady(true));
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [reduceMotion, visible]);

  if (!visible || reduceMotion) return null;

  return (
    <motion.div
      className="home-launch-intro"
      initial={{ y: 0 }}
      animate={{ y: canExit ? "-100%" : 0 }}
      transition={{ duration: canExit ? 0.72 : 0, ease: [0.76, 0, 0.24, 1] }}
      onAnimationComplete={() => {
        if (canExit) completeIntro();
      }}
      aria-hidden="true"
    >
      <div className="home-launch-motion-stage">
        <div className="home-launch-dot-grid" />
        <div className="home-launch-noise" />
        <div className="home-launch-energy-core" />
        <div className="home-launch-scan-line" />
        <div className="home-launch-data-line">
          <span />
        </div>
        {launchBlocks.map((block) => (
          <motion.span
            key={block.id}
            className="home-launch-pixel-block"
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.w}%`,
              height: `${block.h}%`
            }}
            initial={{ opacity: 0, y: 14, scaleX: 0.7 }}
            animate={{ opacity: [0, 0.42, 0.18, 0.34], y: [14, 0, 3, 0], scaleX: 1 }}
            transition={{ delay: 0.18 + block.id * 0.045, duration: 2.9, repeat: Infinity, repeatDelay: 1.2, ease: "easeOut" }}
          />
        ))}
        {launchDataPoints.map((point) => (
          <motion.span
            key={point.value}
            className="home-launch-data-point"
            style={{ left: point.left, top: point.top }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 0.65, 1], scale: [0.7, 1, 0.92, 1] }}
            transition={{ delay: 0.8, duration: 1.6, repeat: Infinity, repeatDelay: 1.8 }}
          >
            <i />
            <b>{point.value}</b>
          </motion.span>
        ))}
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
