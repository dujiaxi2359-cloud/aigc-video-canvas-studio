import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactFlow, { ConnectionLineType, Panel, useReactFlow, type ReactFlowInstance } from "reactflow";
import { CircleHelp, Grid3X3, Map, Scan } from "lucide-react";
import { ConnectionCreateMenu, type ConnectionCreateMenuState } from "./ConnectionCreateMenu";
import { nodeTypes } from "./nodeTypes";
import { StudioEdge } from "./StudioEdge";
import { StudioConnectionLine } from "./StudioConnectionLine";
import { useCanvasHotkeys } from "./useCanvasHotkeys";
import { useCanvasStore } from "../../store/canvasStore";
import type { WorkflowNodeType } from "../../types/node";
import { DotGridBackground } from "./DotGridBackground";

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
const nodeDragHandleSelector = ".drag-handle, .node-drag-handle";

function ZoomControls({ showGrid, onToggleGrid }: { showGrid: boolean; onToggleGrid: () => void }) {
  const { fitView, zoomTo } = useReactFlow();
  const [zoom, setZoom] = useState(0.85);
  const zoomFrameRef = useRef<number | null>(null);

  function handleZoomChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value) / 100;
    setZoom(next);
    if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomTo(next);
      zoomFrameRef.current = null;
    });
  }

  return (
    <Panel position="bottom-left" className="!bottom-1 !left-1 !m-0">
      <div className="canvas-view-controls">
        <button title="小地图"><Map size={16} /></button>
        <button title={showGrid ? "隐藏点阵" : "显示点阵"} className={showGrid ? "is-active" : ""} onClick={onToggleGrid}><Grid3X3 size={16} /></button>
        <button title="适应画布" onClick={() => fitView({ padding: 0.28 })}><Scan size={16} /></button>
        <input title="缩放" type="range" min="30" max="140" value={Math.round(zoom * 100)} onChange={handleZoomChange} />
        <button title="帮助" onClick={() => window.dispatchEvent(new CustomEvent("studio:open-help"))}><CircleHelp size={16} /></button>
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

function canOpenPaneAddMenu(target: HTMLElement | null) {
  if (!target) return false;
  if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__handle")) return false;
  if (target.closest("[data-add-node-menu], [data-connection-create-menu], button, input, textarea, select, a")) return false;
  return Boolean(target.closest(".canvas-space, .react-flow, .react-flow__pane, .react-flow__viewport, .react-flow__renderer, .react-flow__background"));
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

export function WorkflowCanvas({ showGrid = true, onToggleGrid = () => undefined }: { showGrid?: boolean; onToggleGrid?: () => void }) {
  const { nodes, edges, onNodesChange, onEdgesChange, connectNodes, addConnectedNode, addAssetNode, selectEdge, clearSelection } = useCanvasStore();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string | null; handleId?: string | null }>({ nodeId: null, handleId: null });
  const didConnectRef = useRef(false);
  const ignoreNextPaneClickRef = useRef(false);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCanvasInteracting, setIsCanvasInteracting] = useState(false);
  const isCanvasInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<number | null>(null);
  const stableNodeTypes = useRef(nodeTypes).current;
  const stableEdgeTypes = useRef(edgeTypes).current;
  useCanvasHotkeys();
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "studioEdge",
      animated: false
    }),
    []
  );

  const displayEdges = useMemo(() => edges.map((edge) => ({ ...edge, type: "studioEdge", animated: false })), [edges]);
  const displayNodes = useMemo(() => nodes.map((node) => ({ ...node, dragHandle: nodeDragHandleSelector })), [nodes]);

  const beginCanvasInteraction = useCallback(() => {
    if (interactionTimeoutRef.current) {
      window.clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
    if (isCanvasInteractingRef.current) return;
    isCanvasInteractingRef.current = true;
    setIsCanvasInteracting(true);
  }, []);

  const endCanvasInteraction = useCallback(() => {
    if (interactionTimeoutRef.current) window.clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = window.setTimeout(() => {
      isCanvasInteractingRef.current = false;
      setIsCanvasInteracting(false);
      interactionTimeoutRef.current = null;
    }, 180);
  }, []);

  useEffect(() => () => {
    if (interactionTimeoutRef.current) window.clearTimeout(interactionTimeoutRef.current);
  }, []);

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

  const openAddNodeMenuAt = useCallback(
    (point: { x: number; y: number }) => {
      window.dispatchEvent(new CustomEvent("studio:open-add-node", {
        detail: {
          position: screenToFlow(point),
          menuPosition: point
        }
      }));
    },
    [screenToFlow]
  );

  const closeConnectionMenu = useCallback(() => {
    setConnectionMenuOpen(false);
    setPendingConnection(null);
  }, []);

  const closeMenus = useCallback(() => {
    closeConnectionMenu();
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
      className={`canvas-space has-dot-grid relative h-full w-full bg-[#020203] ${isConnecting ? "is-connecting" : ""} ${isCanvasInteracting ? "is-interacting" : ""}`}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (canOpenPaneAddMenu(target)) openAddNodeMenuAt({ x: event.clientX, y: event.clientY });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const target = event.target as HTMLElement | null;
        if (!canOpenPaneAddMenu(target)) return;
        openAddNodeMenuAt({ x: event.clientX, y: event.clientY });
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/aigc-asset")) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/aigc-asset");
        if (!raw) return;
        event.preventDefault();
        try {
          const asset = JSON.parse(raw) as { assetId: string; type: string; url?: string; filePath?: string; thumbnailUrl?: string; width?: number; height?: number; duration?: number };
          addAssetNode(asset, screenToFlow({ x: event.clientX, y: event.clientY }));
        } catch {
          // Ignore malformed drag payloads from outside the app.
        }
      }}
    >
      {showGrid && !isCanvasInteracting && <DotGridBackground />}
      <ReactFlowWithExtras
        className="studio-flow"
        nodes={displayNodes}
        edges={displayEdges}
        onlyRenderVisibleElements
        nodeTypes={stableNodeTypes}
        edgeTypes={stableEdgeTypes}
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
        }}
        onPaneClick={() => {
          if (ignoreNextPaneClickRef.current) {
            ignoreNextPaneClickRef.current = false;
            return;
          }
          clearSelection();
          closeMenus();
        }}
        onPaneContextMenu={(event: MouseEvent) => {
          event.preventDefault();
          openAddNodeMenuAt({ x: event.clientX, y: event.clientY });
        }}
        nodesDraggable
        onNodeDragStart={beginCanvasInteraction}
        onNodeDragStop={endCanvasInteraction}
        onMoveStart={beginCanvasInteraction}
        onMove={beginCanvasInteraction}
        onMoveEnd={endCanvasInteraction}
        panOnDrag={[0, 1]}
        panOnScroll
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        noDragClassName="nodrag"
        noWheelClassName="nowheel"
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        deleteKeyCode={null}
        defaultViewport={{ x: 120, y: 80, zoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.4}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineComponent={StudioConnectionLine}
        connectionRadius={44}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <ZoomControls showGrid={showGrid} onToggleGrid={onToggleGrid} />
      </ReactFlowWithExtras>

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
