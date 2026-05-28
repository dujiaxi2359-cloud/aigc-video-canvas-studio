import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppLayout } from "./components/layout/AppLayout";
import { FirstRunGuideModal } from "./components/modals/FirstRunGuideModal";
import { AssetLibraryPage } from "./pages/AssetLibraryPage";
import { CanvasPage } from "./pages/CanvasPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useModelConfigStore } from "./store/modelConfigStore";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

export type Page = "dashboard" | "canvas" | "settings" | "assets" | "history";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [showGuide, setShowGuide] = useState(false);
  const { modelConfigs, fetchModelConfigs } = useModelConfigStore();

  useEffect(() => {
    fetchModelConfigs().then(() => {
      const enabled = useModelConfigStore.getState().modelConfigs.some((model) => model.enabled);
      if (!enabled) setShowGuide(true);
    }).catch(() => undefined);
  }, [fetchModelConfigs]);

  useEffect(() => {
    const handler = (event: Event) => setPage((event as CustomEvent<Page>).detail);
    window.addEventListener("navigate", handler);
    return () => window.removeEventListener("navigate", handler);
  }, []);

  return (
    <AppLayout page={page} onNavigate={setPage}>
      <AnimatePresence mode="wait">
        {page === "dashboard" && (
          <DashboardPage key="dashboard" onNavigate={setPage} />
        )}
        {page === "canvas" && (
          <motion.div
            key="canvas"
            className="h-full"
            initial={{ opacity: 0, scale: 0.92, filter: "blur(24px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.96, filter: "blur(18px)" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <ErrorBoundary>
              <CanvasPage />
            </ErrorBoundary>
          </motion.div>
        )}
        {page === "settings" && <SettingsPage key="settings" />}
        {page === "assets" && <AssetLibraryPage key="assets" />}
        {page === "history" && <HistoryPage key="history" />}
      </AnimatePresence>
      {showGuide && !modelConfigs.some((model) => model.enabled) && (
        <FirstRunGuideModal
          onClose={() => setShowGuide(false)}
          onSettings={() => {
            setShowGuide(false);
            setPage("settings");
          }}
        />
      )}
    </AppLayout>
  );
}
