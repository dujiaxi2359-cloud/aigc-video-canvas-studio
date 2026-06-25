import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import type { Page } from "../App";
import { FerrofluidBackground } from "../components/home/FerrofluidBackground";
import { HomeLaunchIntro } from "../components/home/HomeLaunchIntro";
import { HomePlasmaBackground } from "../components/home/HomePlasmaBackground";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useI18nStore } from "../i18n";
import { useThemeStore } from "../store/themeStore";

const ICP_RECORD = "粤ICP备2026074382号";
const STUDIO_NAME = "Moon｜Tv";

export function BrandGatewayPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const promptSectionRef = useRef<HTMLElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const spotlightFrameRef = useRef(0);
  const t = useI18nStore((state) => state.t);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [launchComplete, setLaunchComplete] = useState(() => {
    if (typeof window === "undefined") return false;
    const shouldSkipLaunch = window.sessionStorage.getItem("moon.home.skipLaunch") === "1";
    if (shouldSkipLaunch) window.sessionStorage.removeItem("moon.home.skipLaunch");
    return shouldSkipLaunch;
  });

  useEffect(() => {
    const focusPrompt = () => {
      promptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("home:focusPrompt", focusPrompt);
    return () => {
      window.removeEventListener("home:focusPrompt", focusPrompt);
      if (spotlightFrameRef.current) cancelAnimationFrame(spotlightFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!launchComplete) return;
    const root = heroCopyRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      if (reduced) {
        gsap.set("[data-hero-reveal]", { autoAlpha: 1, y: 0 });
        return;
      }
      gsap.timeline({ defaults: { ease: "power3.out", duration: 0.42 } })
        .fromTo("[data-hero-reveal]", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, stagger: 0.055, clearProps: "transform,visibility" });
    }, root);
    return () => context.revert();
  }, [launchComplete]);

  function updateSpotlight(event: MouseEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const x = event.clientX;
    const y = event.clientY;
    if (spotlightFrameRef.current) return;
    spotlightFrameRef.current = requestAnimationFrame(() => {
      spotlightFrameRef.current = 0;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--spotlight-x", `${x - rect.left}px`);
      target.style.setProperty("--spotlight-y", `${y - rect.top}px`);
    });
  }

  return (
    <motion.div
      className="studio-page home-gateway home-flagship-shell h-full overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
      onMouseMove={updateSpotlight}
    >
      {!launchComplete ? <HomeLaunchIntro onFinish={() => setLaunchComplete(true)} /> : null}
      {launchComplete && resolvedTheme === "dark" ? <FerrofluidBackground className="home-page-ferrofluid" /> : null}
      {launchComplete && resolvedTheme === "light" ? (
        <HomePlasmaBackground
          className="home-page-plasma"
          color="#94a3b8"
          speed={1}
          direction="forward"
          scale={1}
          opacity={1}
          mouseInteractive={false}
        />
      ) : null}
      <HomeTopNav page="home" onNavigate={onNavigate} />

      <main className="home-flagship-content">
        <section ref={promptSectionRef} className="home-unicorn-hero" aria-label={t("home.heroAria")}>
          <div className="home-unicorn-hero-stage">
            <div className="home-unicorn-title-shield" />
            <div ref={heroCopyRef} className="home-unicorn-copy">
              <p className="home-unicorn-eyebrow" data-hero-reveal>
                {t("home.heroEyebrow")}
              </p>
              <div className="home-unicorn-brand-title" data-hero-reveal>{t("home.heroBrand")}</div>
              <div className="home-unicorn-cn-title" data-hero-reveal>{t("home.heroCn")}</div>
              <div className="home-unicorn-en-title" data-hero-reveal>{t("home.heroEn")}</div>
              <button
                type="button"
                className="home-unicorn-start-button"
                onClick={() => onNavigate("canvas", "new")}
                data-hero-reveal
              >
                {t("home.start")}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-flagship-footer">
        <div className="mx-auto max-w-[1380px] px-5 py-16 md:px-10">
          <div className="grid gap-10 border-y border-white/[0.07] py-14 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="text-[24px] font-black text-white">Moon｜Tv</div>
              <p className="mt-5 max-w-[380px] text-[14px] leading-7 text-white/34">
                {t("home.footerDesc")}
              </p>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white/78">{t("home.support")}</div>
              <div className="mt-5 grid gap-4 text-[14px] text-white/32">
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">{t("account.helpCenter")}</button>
                <button type="button" onClick={() => onNavigate("settings")} className="w-fit transition hover:text-white/70">{t("account.contact")}</button>
              </div>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white/78">{t("home.about")}</div>
              <div className="mt-5 grid gap-4 text-[14px] text-white/32">
                <a href="/terms" className="w-fit transition hover:text-white/70">{t("home.terms")}</a>
                <a href="/privacy" className="w-fit transition hover:text-white/70">{t("home.privacy")}</a>
              </div>
            </div>
          </div>

          <div className="py-10 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[16px] font-semibold text-white/80">
              <a href="/privacy" className="transition hover:text-white">{t("home.privacy")}</a>
              <span className="text-white/28">·</span>
              <a href="/terms" className="transition hover:text-white">{t("home.terms")}</a>
            </div>
            <div className="mt-7 text-[15px] font-semibold text-white/46">
              {t("home.rights", { name: STUDIO_NAME })}
            </div>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block text-[13px] font-semibold tracking-[0.12em] text-white/26 transition hover:text-white/62"
            >
              {ICP_RECORD}
            </a>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-8 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/24 md:flex-row md:items-center md:justify-between">
            <span>© 2026 Moon｜Tv</span>
            <span>imagephotos.asia</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
