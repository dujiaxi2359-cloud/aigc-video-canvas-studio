import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppLayout } from "./components/layout/AppLayout";
import { FirstRunGuideModal } from "./components/modals/FirstRunGuideModal";
import { AssetLibraryPage } from "./pages/AssetLibraryPage";
import { CanvasPage } from "./pages/CanvasPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { useModelConfigStore } from "./store/modelConfigStore";
import { useCanvasStore } from "./store/canvasStore";
import { useProjectStore } from "./store/projectStore";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { useAuthStore } from "./store/authStore";
import { LoginPage } from "./pages/LoginPage";
import { InvitePage } from "./pages/InvitePage";

export type Page = "login" | "invite" | "home" | "workspace" | "canvas" | "templates" | "community" | "arena" | "pricing" | "account" | "settings" | "assets" | "history";

function routeState() {
  const path = window.location.pathname;
  if (path.startsWith("/canvas/")) return { page: "canvas" as Page, projectId: decodeURIComponent(path.slice("/canvas/".length)) };
  const route = path.slice(1) as Page;
  const supported: Page[] = ["login", "invite", "home", "workspace", "templates", "community", "arena", "pricing", "account", "settings", "assets", "history"];
  const page = supported.includes(route) ? route : "home";
  return { page };
}

function pagePath(page: Page, projectId?: string) {
  if (page === "canvas") return `/canvas/${encodeURIComponent(projectId || "new")}`;
  return `/${page}`;
}

export default function App() {
  const initialRoute = routeState();
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [routeProjectId, setRouteProjectId] = useState<string | undefined>(initialRoute.projectId);
  const [showGuide, setShowGuide] = useState(false);
  const { modelConfigs, fetchModelConfigs } = useModelConfigStore();
  const loadCanvasProject = useCanvasStore((state) => state.loadProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const auth = useAuthStore();
  const canAdmin = auth.user && ["admin", "super_admin"].includes(auth.user.role);

  function navigate(pageName: Page, projectId?: string, replace = false) {
    const nextProjectId = pageName === "canvas" ? projectId || useProjectStore.getState().currentProject?.id || "new" : undefined;
    const nextPath = pagePath(pageName, nextProjectId);
    if (replace) window.history.replaceState({}, "", nextPath);
    else if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setRouteProjectId(nextProjectId);
    setPage(pageName);
  }

  useEffect(() => {
    void auth.bootstrap();
    const requireAuth = () => auth.clear();
    window.addEventListener("auth:required", requireAuth);
    return () => window.removeEventListener("auth:required", requireAuth);
  }, []);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      if (window.location.pathname !== "/login") window.history.replaceState({}, "", "/login");
      setPage("login");
      return;
    }
    if (auth.user.inviteStatus !== "active") {
      if (window.location.pathname !== "/invite") window.history.replaceState({}, "", "/invite");
      setPage("invite");
      return;
    }
    if (["login", "invite"].includes(page)) navigate("workspace", undefined, true);
  }, [auth.loading, auth.user?.id, auth.user?.inviteStatus]);

  useEffect(() => {
    if (!auth.user || auth.user.inviteStatus !== "active") return;
    fetchModelConfigs().then(() => {
      const enabled = useModelConfigStore.getState().modelConfigs.some((model) => model.enabled);
      if (!enabled && canAdmin) setShowGuide(true);
    }).catch(() => undefined);
  }, [auth.user?.id, canAdmin, fetchModelConfigs]);

  useEffect(() => {
    if (window.location.pathname === "/") navigate("home", undefined, true);
    const popstate = () => {
      const next = routeState();
      setPage(next.page);
      setRouteProjectId(next.projectId);
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Page | { page: Page; projectId?: string }>).detail;
      if (typeof detail === "string") navigate(detail);
      else if (detail?.page) navigate(detail.page, detail.projectId);
    };
    window.addEventListener("popstate", popstate);
    window.addEventListener("navigate", handler);
    return () => {
      window.removeEventListener("popstate", popstate);
      window.removeEventListener("navigate", handler);
    };
  }, []);

  useEffect(() => {
    if (page !== "canvas" || !routeProjectId || routeProjectId === "new") return;
    loadProject(routeProjectId)
      .then((project) => loadCanvasProject(project.nodes, project.edges))
      .catch(() => undefined);
  }, [loadCanvasProject, loadProject, page, routeProjectId]);

  if (auth.loading) return <div className="grid h-screen place-items-center bg-[#070708] text-[13px] text-white/45">正在验证会话...</div>;
  if (!auth.user) return <LoginPage />;
  if (auth.user.inviteStatus !== "active") return <InvitePage />;

  return (
    <AppLayout page={page} onNavigate={navigate}>
      <AnimatePresence mode="wait">
        {page === "home" && (
          <DashboardPage key="home" onNavigate={navigate} />
        )}
        {page === "workspace" && (
          <WorkspacePage key="workspace" onNavigate={navigate} />
        )}
        {page === "canvas" && (
          <motion.div
            key="canvas"
            className="h-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <ErrorBoundary>
              <CanvasPage onNavigate={navigate} />
            </ErrorBoundary>
          </motion.div>
        )}
        {page === "settings" && <SettingsPage key="settings" onNavigate={navigate} />}
        {page === "assets" && <AssetLibraryPage key="assets" onNavigate={navigate} />}
        {page === "history" && <HistoryPage key="history" />}
        {["templates", "community", "arena", "pricing", "account"].includes(page) && (
          <PlaceholderPage key={page} page={page} onNavigate={navigate} />
        )}
      </AnimatePresence>
      {showGuide && canAdmin && !modelConfigs.some((model) => model.enabled) && (
        <FirstRunGuideModal
          onClose={() => setShowGuide(false)}
          onSettings={() => {
            setShowGuide(false);
            navigate("settings");
          }}
        />
      )}
    </AppLayout>
  );
}
