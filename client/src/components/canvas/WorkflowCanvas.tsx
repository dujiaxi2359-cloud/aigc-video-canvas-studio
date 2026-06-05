import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, BackgroundVariant, ConnectionLineType, Panel, useReactFlow, type ReactFlowInstance } from "reactflow";
import { Minus, Plus, Scan } from "lucide-react";
import { CanvasContextMenu, type CanvasMenuState } from "./CanvasContextMenu";
import { ConnectionCreateMenu, type ConnectionCreateMenuState } from "./ConnectionCreateMenu";
import { nodeTypes } from "./nodeTypes";
import { StudioEdge } from "./StudioEdge";
import { StudioConnectionLine } from "./StudioConnectionLine";
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
      <div className="canvas-glass-pill flex overflow-hidden">
        <button className="grid h-10 w-10 place-items-center text-[#d2d9e3] transition hover:bg-white/[0.045] hover:text-white" onClick={() => zoomOut()}>
          <Minus size={16} strokeWidth={1.8} />
        </button>
        <button className="grid h-10 w-10 place-items-center border-x border-white/[0.08] text-[#d2d9e3] transition hover:bg-white/[0.045] hover:text-white" onClick={() => fitView({ padding: 0.28 })}>
          <Scan size={16} strokeWidth={1.8} />
        </button>
        <button className="grid h-10 w-10 place-items-center text-[#d2d9e3] transition hover:bg-white/[0.045] hover:text-white" onClick={() => zoomIn()}>
          <Plus size={16} strokeWidth={1.8} />
        </button>
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

type SnappedHandle = { nodeId: string; handleId: string | null; distance: number };

function nearestTargetHandle(point: { x: number; y: number }, sourceNodeId: string, zoom: number): SnappedHandle | null {
  const snapRadius = zoom < 0.5 ? 48 : zoom < 0.75 ? 42 : 34;
  let nearest: { nodeId: string; handleId: string | null; distance: number } | null = null;
  document.querySelectorAll<HTMLElement>(".react-flow__handle.target").forEach((handle) => {
    const nodeId = handle.getAttribute("data-nodeid");
    if (!nodeId || nodeId === sourceNodeId) return;
    const rect = handle.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    if (distance > snapRadius || (nearest && nearest.distance <= distance)) return;
    nearest = {
      nodeId,
      handleId: handle.getAttribute("data-handleid"),
      distance
    };
  });
  return nearest;
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [contextMenu, setContextMenu] = useState<CanvasMenuState | null>(null);
  useCanvasHotkeys();
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "studioEdge",
      animated: true
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
    setIsConnecting(true);
    closeConnectionMenu();
  }, [closeConnectionMenu]);

  const onConnect = useCallback(
    (connection: Parameters<typeof connectNodes>[0]) => {
      didConnectRef.current = true;
      connectNodes(connection);
      closeConnectionMenu();
      connectingNodeRef.current = { nodeId: null, handleId: null };
      setIsConnecting(false);
    },
    [closeConnectionMenu, connectNodes]
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const sourceNodeId = connectingNodeRef.current.nodeId;
      const sourceHandleId = connectingNodeRef.current.handleId;

      if (!sourceNodeId) {
        setIsConnecting(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      const isHandle = Boolean(target?.closest?.(".react-flow__handle"));

      if (didConnectRef.current || isHandle) {
        connectingNodeRef.current = { nodeId: null, handleId: null };
        didConnectRef.current = false;
        setIsConnecting(false);
        return;
      }

      const point = getEventPoint(event);
      const snapped = nearestTargetHandle(point, sourceNodeId, reactFlow?.getZoom?.() ?? 1);
      if (snapped) {
        connectNodes({
          source: sourceNodeId,
          sourceHandle: sourceHandleId ?? "out",
          target: snapped.nodeId,
          targetHandle: snapped.handleId
        });
        closeConnectionMenu();
        connectingNodeRef.current = { nodeId: null, handleId: null };
        didConnectRef.current = false;
        setIsConnecting(false);
        return;
      }

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
      setIsConnecting(false);
    },
    [closeConnectionMenu, connectNodes, reactFlow, screenToFlow]
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
      className={`canvas-space relative h-full w-full bg-[#020203] ${isConnecting ? "is-connecting" : ""}`}
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
          if (isConnecting) return;
          event.preventDefault();
          event.stopPropagation();
          selectEdge(edge.id);
          const relatedNode = nodes.find((node) => node.id === edge.target) ?? nodes.find((node) => node.id === edge.source);
          setContextMenu({ type: "edge", edge, node: relatedNode, position: { x: event.clientX, y: event.clientY } });
          closeConnectionMenu();
        }}
        onNodeContextMenu={(event: MouseEvent, node: any) => {
          if (isConnecting) return;
          event.preventDefault();
          event.stopPropagation();
          selectNode(node.id);
          setContextMenu({ type: "node", node, position: { x: event.clientX, y: event.clientY } });
          closeConnectionMenu();
        }}
        onPaneContextMenu={(event: MouseEvent) => {
          if (isConnecting) return;
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
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineComponent={StudioConnectionLine}
        connectionRadius={44}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background color="rgba(255,255,255,0.03)" gap={40} size={1} variant={BackgroundVariant.Dots} />
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
