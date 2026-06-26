import { useEffect, useRef, useState } from "react";
import type { Page } from "../App";
import { AgentPanel } from "../components/agent/AgentPanel";
import { AddNodeMenu } from "../components/canvas/AddNodeMenu";
import { CanvasDrawer, CanvasEmptyGuide, CanvasFloatingToolbar, CanvasTopBar, ShareProjectModal, type DrawerName } from "../components/canvas/CanvasChrome";
import { WorkflowCanvas } from "../components/canvas/WorkflowCanvas";
import { useAgentStore } from "../store/agentStore";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import { projectApi } from "../services/projectApi";
import { director3DEnabled } from "../config/featureFlags";

export function CanvasPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPosition, setAddPosition] = useState<{ x: number; y: number }>();
  const [addMenuPosition, setAddMenuPosition] = useState<{ x: number; y: number }>();
  const [shareOpen, setShareOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const addNode = useCanvasStore((state) => state.addNode);
  const openAgent = useAgentStore((state) => state.openAgent);
  const currentProject = useProjectStore((state) => state.currentProject);
  const saveProject = useProjectStore((state) => state.saveProject);
  const latestCanvasRef = useRef({ nodes, edges });
  const lastSavedSignatureRef = useRef("");
  const activeProjectIdRef = useRef<string>();

  useEffect(() => {
    latestCanvasRef.current = { nodes, edges };
  }, [edges, nodes]);

  useEffect(() => {
    const signature = JSON.stringify({ nodes, edges });
    if (currentProject?.id !== activeProjectIdRef.current) {
      activeProjectIdRef.current = currentProject?.id;
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (!currentProject && nodes.length === 0 && edges.length === 0) {
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      lastSavedSignatureRef.current = signature;
      void saveProject(nodes, edges).catch(() => {
        lastSavedSignatureRef.current = "";
      });
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [currentProject, edges, nodes, saveProject]);

  useEffect(() => {
    function saveBeforeExit() {
      const project = useProjectStore.getState().currentProject;
      const canvas = latestCanvasRef.current;
      const signature = JSON.stringify(canvas);
      if (signature === lastSavedSignatureRef.current) return;
      lastSavedSignatureRef.current = signature;
      if (!project) {
        if (canvas.nodes.length > 0 || canvas.edges.length > 0) {
          void useProjectStore.getState().saveProject(canvas.nodes, canvas.edges);
        }
        return;
      }
      projectApi.saveOnExit({ ...project, ...canvas });
    }

    function saveWhenHidden() {
      if (document.visibilityState === "hidden") saveBeforeExit();
    }

    window.addEventListener("pagehide", saveBeforeExit);
    window.addEventListener("beforeunload", saveBeforeExit);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeExit);
      window.removeEventListener("beforeunload", saveBeforeExit);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      saveBeforeExit();
    };
  }, []);

  useEffect(() => {
    const openAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ position?: { x: number; y: number }; menuPosition?: { x: number; y: number } }>).detail;
      const position = detail?.position;
      setDrawer(null);
      setAddPosition(position);
      setAddMenuPosition(detail?.menuPosition);
      setAddOpen(true);
    };
    const openDrawer = (event: Event) => {
      const name = (event as CustomEvent<Exclude<DrawerName, null>>).detail;
      if (!name) return;
      setAddOpen(false);
      setDrawer(name);
    };
    const quickAdd = (event: Event) => {
      const type = (event as CustomEvent<string>).detail;
      if (type === "director_3d" && !director3DEnabled) return;
      if (["text", "image", "video", "imageGenerate", "director_3d"].includes(type)) addNode(type as "text" | "image" | "video" | "imageGenerate" | "director_3d");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawer(null);
      setAddOpen(false);
      setShareOpen(false);
    };
    window.addEventListener("studio:open-add-node", openAdd);
    window.addEventListener("studio:open-drawer", openDrawer);
    window.addEventListener("studio:quick-add-node", quickAdd);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("studio:open-add-node", openAdd);
      window.removeEventListener("studio:open-drawer", openDrawer);
      window.removeEventListener("studio:quick-add-node", quickAdd);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [addNode]);

  function toggleDrawer(name: Exclude<DrawerName, null>) {
    setAddOpen(false);
    setDrawer((current) => current === name ? null : name);
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#050608]">
      <WorkflowCanvas showGrid={showGrid} onToggleGrid={() => setShowGrid((value) => !value)} />
      <CanvasTopBar onNavigate={onNavigate} onShare={() => setShareOpen(true)} />
      <CanvasFloatingToolbar
        drawer={drawer}
        addOpen={addOpen}
        onAdd={() => {
          setDrawer(null);
          setAddPosition(undefined);
          setAddMenuPosition(undefined);
          setAddOpen((value) => !value);
        }}
        onDrawer={toggleDrawer}
        onAgent={() => {
          setDrawer(null);
          setAddOpen(false);
          openAgent();
        }}
      />
      <AddNodeMenu open={addOpen} nodePosition={addPosition} menuPosition={addMenuPosition} onClose={() => setAddOpen(false)} />
      <CanvasDrawer drawer={drawer} onClose={() => setDrawer(null)} onNavigate={onNavigate} />
      {nodes.length === 0 && <CanvasEmptyGuide onAdd={addNode} onTemplates={() => toggleDrawer("templates")} />}
      <button type="button" title="Moon｜Tv 创作助手" onClick={() => openAgent()} className="canvas-brand-orb">M</button>
      <AgentPanel />
      <ShareProjectModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
