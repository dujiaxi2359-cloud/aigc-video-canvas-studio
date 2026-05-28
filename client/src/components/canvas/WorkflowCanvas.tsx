import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, BackgroundVariant, ConnectionLineType, Panel, useReactFlow, type ReactFlowInstance } from "reactflow";
import { Image, Layers3, Minus, Plus, Scan, Sparkles, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { CanvasContextMenu, type CanvasMenuState } from "./CanvasContextMenu";
import { ConnectionCreateMenu, type ConnectionCreateMenuState } from "./ConnectionCreateMenu";
import { nodeTypes } from "./nodeTypes";
import { StudioEdge } from "./StudioEdge";
import { useCanvasHotkeys } from "./useCanvasHotkeys";
import { useCanvasStore } from "../../store/canvasStore";
import { AgentFloatingButton } from "../agent/AgentFloatingButton";
import { AgentPanel } from "../agent/AgentPanel";
import { ObsidianBackground } from "../visual/ObsidianBackground";
import type { WorkflowNodeType } from "../../types/node";

type PendingConnection = {
  sourceNodeId: string;
  sourceHandleId?: string | null;
  screenPosition: {
    x: number;
    y: number;
  };
  flowPosition: {
    x: number;
    y: number;
  };
};

const ReactFlowWithExtras = ReactFlow as unknown as React.ComponentType<any>;
const edgeTypes = { studioEdge: StudioEdge };

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="bottom-right" className="!m-5">
      <div className="flex overflow-hidden rounded-2xl border border-white/[0.08] bg-[#11141b]/[0.88] shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center text-[#d2d9e3] hover:bg-white/[0.05] hover:text-white" onClick={() => zoomOut()}>
          <Minus size={16} strokeWidth={1.8} />
        </button>
        <button className="grid h-10 w-10 place-items-center border-x border-white/[0.08] text-[#d2d9e3] hover:bg-white/[0.05] hover:text-white" onClick={() => fitView({ padding: 0.28 })}>
          <Scan size={16} strokeWidth={1.8} />
        </button>
        <button className="grid h-10 w-10 place-items-center text-[#d2d9e3] hover:bg-white/[0.05] hover:text-white" onClick={() => zoomIn()}>
          <Plus size={16} strokeWidth={1.8} />
        </button>
      </div>
    </Panel>
  );
}

function QuickGenerateBar() {
  return (
    <Panel position="top-center" className="!mt-[88px]">
      <div className="relative">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.08)_0%,transparent_70%)] blur-[70px]" />
        <motion.div
          layoutId="portal-bar"
          className="pointer-events-auto relative z-10 flex h-[42px] items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.035] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl"
        >
          {[
            { icon: Sparkles, label: "智能生成" },
            { icon: Image, label: "引用素材" },
            { icon: Wand2, label: "反推提示词" },
            { icon: Layers3, label: "合成视频" }
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] transition ${
                  index === 0
                    ? "border-violet-400/28 bg-violet-500/[0.18] text-white shadow-[inset_0_0_20px_rgba(139,92,246,0.10)]"
                    : "border-transparent bg-transparent text-white/52 hover:bg-white/[0.06] hover:text-white/88"
                }`}
              >
                <Icon size={15} strokeWidth={1.7} />
                {item.label}
              </button>
            );
          })}
        </motion.div>
      </div>
    </Panel>
  );
}

function getEventPoint(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  const mouseEvent = event as MouseEvent;
  return { x: mouseEvent.clientX, y: mouseEvent.clientY };
}

export function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, connectNodes, addConnectedNode, addAssetNode, selectEdge, selectNode, clearSelection } = useCanvasStore();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string | null; handleId?: string | null }>({ nodeId: null, handleId: null });
  const didConnectRef = useRef(false);
  const ignoreNextPaneClickRef = useRef(false);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<CanvasMenuState | null>(null);
  useCanvasHotkeys();
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "studioEdge",
      animated: true,
      style: {
        stroke: "rgba(81,199,255,0.62)",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 4px rgba(81,199,255,0.24))"
      }
    }),
    []
  );

  const displayEdges = useMemo(() => edges.map((edge) => ({ ...edge, type: "studioEdge" })), [edges]);

  const screenToFlow = useCallback(
    (position: { x: number; y: number }) => {
      const instance = reactFlow as unknown as {
        project?: (position: { x: number; y: number }) => { x: number; y: number };
        screenToFlowPosition?: (position: { x: number; y: number }) => { x: number; y: number };
      };

      if (instance?.screenToFlowPosition) return instance.screenToFlowPosition(position);

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const panePosition = bounds ? { x: position.x - bounds.left, y: position.y - bounds.top } : position;
      return instance?.project?.(panePosition) ?? panePosition;
    },
    [reactFlow]
  );

  const closeConnectionMenu = useCallback(() => {
    setConnectionMenuOpen(false);
    setPendingConnection(null);
  }, []);

  const closeMenus = useCallback(() => {
    closeConnectionMenu();
    setContextMenu(null);
  }, [closeConnectionMenu]);

  const openMenuForSource = useCallback(
    (sourceNodeId: string, sourceHandleId: string | null | undefined, screenPosition: { x: number; y: number }, flowPosition?: { x: number; y: number }) => {
      setPendingConnection({
        sourceNodeId,
        sourceHandleId,
        screenPosition,
        flowPosition: flowPosition ?? screenToFlow(screenPosition)
      });
      setConnectionMenuOpen(true);
    },
    [screenToFlow]
  );

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent).detail as { sourceId: string; clientX: number; clientY: number };
      if (!nodes.some((node) => node.id === detail.sourceId)) return;
      openMenuForSource(detail.sourceId, "out", { x: detail.clientX, y: detail.clientY });
    }
    window.addEventListener("studio:open-connection-menu", handleOpen);
    return () => window.removeEventListener("studio:open-connection-menu", handleOpen);
  }, [nodes, openMenuForSource]);

  const onConnectStart = useCallback((_: unknown, params: { nodeId?: string | null; handleId?: string | null }) => {
    connectingNodeRef.current = {
      nodeId: params.nodeId ?? null,
      handleId: params.handleId ?? null
    };
    didConnectRef.current = false;
    closeConnectionMenu();
  }, [closeConnectionMenu]);

  const onConnect = useCallback(
    (connection: Parameters<typeof connectNodes>[0]) => {
      didConnectRef.current = true;
      connectNodes(connection);
      closeConnectionMenu();
      connectingNodeRef.current = { nodeId: null, handleId: null };
    },
    [closeConnectionMenu, connectNodes]
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const sourceNodeId = connectingNodeRef.current.nodeId;
      const sourceHandleId = connectingNodeRef.current.handleId;

      if (!sourceNodeId) return;

      const target = event.target as HTMLElement | null;
      const isHandle = Boolean(target?.closest?.(".react-flow__handle"));

      if (didConnectRef.current || isHandle) {
        connectingNodeRef.current = { nodeId: null, handleId: null };
        didConnectRef.current = false;
        return;
      }

      const point = getEventPoint(event);
      const flowPosition = screenToFlow(point);

      setPendingConnection({
        sourceNodeId,
        sourceHandleId,
        screenPosition: point,
        flowPosition
      });
      ignoreNextPaneClickRef.current = true;
      setConnectionMenuOpen(true);

      connectingNodeRef.current = { nodeId: null, handleId: null };
      didConnectRef.current = false;
    },
    [screenToFlow]
  );

  const menuSourceType = pendingConnection
    ? (nodes.find((node) => node.id === pendingConnection.sourceNodeId)?.type as WorkflowNodeType | undefined)
    : undefined;

  const menu: ConnectionCreateMenuState | null =
    pendingConnection && menuSourceType
      ? {
          sourceId: pendingConnection.sourceNodeId,
          sourceType: menuSourceType,
          position: {
            x: Math.min(pendingConnection.screenPosition.x + 12, window.innerWidth - 240),
            y: Math.min(pendingConnection.screenPosition.y + 12, window.innerHeight - 360)
          },
          flowPosition: {
            x: pendingConnection.flowPosition.x + 40,
            y: pendingConnection.flowPosition.y - 40
          }
        }
      : null;

  return (
    <div
      ref={reactFlowWrapper}
      className="relative h-full w-full bg-[#020203]"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/aigc-asset")) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/aigc-asset");
        if (!raw) return;
        event.preventDefault();
        try {
          const asset = JSON.parse(raw) as { assetId: string; type: string; url?: string; filePath?: string; thumbnailUrl?: string };
          addAssetNode(asset, screenToFlow({ x: event.clientX, y: event.clientY }));
        } catch {
          // Ignore malformed drag payloads from outside the app.
        }
      }}
    >
      <ObsidianBackground variant="canvas" portalGlow />
      <div className="obsidian-noise pointer-events-none absolute inset-0 z-[1]" />
      <ReactFlowWithExtras
        className="studio-flow"
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={setReactFlow}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeClick={(event: MouseEvent, edge: any) => {
          event.stopPropagation();
          selectEdge(edge.id);
          closeConnectionMenu();
          setContextMenu(null);
        }}
        onEdgeContextMenu={(event: MouseEvent, edge: any) => {
          event.preventDefault();
          event.stopPropagation();
          selectEdge(edge.id);
          const relatedNode = nodes.find((node) => node.id === edge.target) ?? nodes.find((node) => node.id === edge.source);
          setContextMenu({ type: "edge", edge, node: relatedNode, position: { x: event.clientX, y: event.clientY } });
          closeConnectionMenu();
        }}
        onNodeContextMenu={(event: MouseEvent, node: any) => {
          event.preventDefault();
          event.stopPropagation();
          selectNode(node.id);
          setContextMenu({ type: "node", node, position: { x: event.clientX, y: event.clientY } });
          closeConnectionMenu();
        }}
        onPaneContextMenu={(event: MouseEvent) => {
          event.preventDefault();
          setContextMenu({ type: "pane", position: { x: event.clientX, y: event.clientY } });
          closeConnectionMenu();
        }}
        onPaneClick={() => {
          if (ignoreNextPaneClickRef.current) {
            ignoreNextPaneClickRef.current = false;
            return;
          }
          clearSelection();
          closeMenus();
        }}
        selectionOnDrag
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        deleteKeyCode={null}
        nodeDragHandle=".node-drag-handle"
        defaultViewport={{ x: 120, y: 80, zoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.4}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background color="rgba(255,255,255,0.03)" gap={40} size={1} variant={BackgroundVariant.Dots} />
        <QuickGenerateBar />
        <ZoomControls />
      </ReactFlowWithExtras>
      <AgentFloatingButton />
      <AgentPanel />
      {contextMenu && <CanvasContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}

      {connectionMenuOpen && menu && (
        <ConnectionCreateMenu
          menu={menu}
          onSelect={(type) => {
            addConnectedNode(menu.sourceId, type, menu.flowPosition);
            closeConnectionMenu();
            connectingNodeRef.current = { nodeId: null, handleId: null };
            didConnectRef.current = false;
          }}
        />
      )}
    </div>
  );
}
