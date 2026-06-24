import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from "react";
import ReactFlow, { ConnectionLineType, MiniMap, Panel, useReactFlow, type ReactFlowInstance } from "reactflow";
import { CircleHelp, Grid3X3, History, ImagePlus, Magnet, Map, Scan, Undo2 } from "lucide-react";
import { ConnectionCreateMenu, type ConnectionCreateMenuState } from "./ConnectionCreateMenu";
import { nodeTypes } from "./nodeTypes";
import { StudioEdge } from "./StudioEdge";
import { StudioConnectionLine } from "./StudioConnectionLine";
import { useCanvasHotkeys } from "./useCanvasHotkeys";
import { useCanvasStore } from "../../store/canvasStore";
import { useAssetStore } from "../../store/assetStore";
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
const droppedImageMimeByExtension: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp"
};

function hasSystemFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types || []).includes("Files");
}

function normalizeDroppedImage(file: File) {
  if (file.type.startsWith("image/")) return file;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mimeType = droppedImageMimeByExtension[extension];
  if (!mimeType) return null;
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}

function ZoomControls({ showGrid, showMiniMap, snapToGrid, onToggleGrid, onToggleMiniMap, onToggleSnap, onOrganize }: {
  showGrid: boolean;
  showMiniMap: boolean;
  snapToGrid: boolean;
  onToggleGrid: () => void;
  onToggleMiniMap: () => void;
  onToggleSnap: () => void;
  onOrganize: () => void;
}) {
  const { zoomTo } = useReactFlow();
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

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      onOrganize();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onOrganize]);

  return (
    <Panel position="bottom-left" className="!bottom-1 !left-1 !m-0">
      <div className="canvas-view-controls">
        <button title="画布小地图" className={showMiniMap ? "is-active" : ""} onClick={onToggleMiniMap}><Map size={16} /></button>
        <button title={showGrid ? "隐藏点阵" : "显示点阵"} className={showGrid ? "is-active" : ""} onClick={onToggleGrid}><Grid3X3 size={16} /></button>
        <button title="自动整理画布 ⌥F" onClick={onOrganize}><Scan size={16} /></button>
        <button title="网格吸附" className={snapToGrid ? "is-active" : ""} onClick={onToggleSnap}><Magnet size={16} /></button>
        <input title="缩放" type="range" min="30" max="140" value={Math.round(zoom * 100)} onChange={handleZoomChange} />
        <span className="canvas-view-zoom-readout">{Math.round(zoom * 100)}%</span>
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
  const { nodes, edges, onNodesChange, onEdgesChange, connectNodes, addConnectedNode, addAssetNode, selectEdge, clearSelection, organizeCanvas } = useCanvasStore();
  const uploadAsset = useAssetStore((state) => state.uploadAsset);
  const lastDeletion = useCanvasStore((state) => state.lastDeletion);
  const restoreLastDeletion = useCanvasStore((state) => state.restoreLastDeletion);
  const clearLastDeletion = useCanvasStore((state) => state.clearLastDeletion);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const systemFileDragDepthRef = useRef(0);
  const connectingNodeRef = useRef<{ nodeId: string | null; handleId?: string | null }>({ nodeId: null, handleId: null });
  const didConnectRef = useRef(false);
  const ignoreNextPaneClickRef = useRef(false);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [isCanvasInteracting, setIsCanvasInteracting] = useState(false);
  const [systemFileDragActive, setSystemFileDragActive] = useState(false);
  const [dropImportProgress, setDropImportProgress] = useState<{ completed: number; total: number } | null>(null);
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

  const organizeAndFit = useCallback(() => {
    organizeCanvas();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        reactFlow?.fitView?.({ padding: 0.2, duration: 420 });
      });
    });
  }, [organizeCanvas, reactFlow]);

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

  useEffect(() => {
    if (!lastDeletion) return;
    const timeout = window.setTimeout(clearLastDeletion, 10000);
    return () => window.clearTimeout(timeout);
  }, [clearLastDeletion, lastDeletion?.deletedAt]);

  useEffect(() => {
    function preventBrowserFileNavigation(event: DragEvent) {
      if (event.dataTransfer && hasSystemFiles(event.dataTransfer)) event.preventDefault();
    }
    function resetSystemFileDrag(event: DragEvent) {
      if (!event.dataTransfer || !hasSystemFiles(event.dataTransfer)) return;
      event.preventDefault();
      systemFileDragDepthRef.current = 0;
      setSystemFileDragActive(false);
    }
    window.addEventListener("dragover", preventBrowserFileNavigation);
    window.addEventListener("drop", resetSystemFileDrag);
    return () => {
      window.removeEventListener("dragover", preventBrowserFileNavigation);
      window.removeEventListener("drop", resetSystemFileDrag);
    };
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

  const importDroppedImages = useCallback(async (files: File[], position: { x: number; y: number }) => {
    const images = files.map(normalizeDroppedImage).filter((file): file is File => Boolean(file));
    const skippedCount = files.length - images.length;
    if (!images.length) {
      window.alert("请拖入图片文件。当前文件没有可导入的图片。");
      return;
    }

    const failures: string[] = [];
    setDropImportProgress({ completed: 0, total: images.length });
    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      try {
        const asset = await uploadAsset(file, { name: file.name.replace(/\.[^.]+$/, "") || "图片素材" });
        addAssetNode({
          assetId: asset.id,
          type: "image",
          url: asset.url,
          filePath: asset.localPath,
          thumbnailUrl: asset.thumbnailUrl,
          width: asset.width,
          height: asset.height
        }, { x: position.x + index * 36, y: position.y + index * 36 });
      } catch {
        failures.push(file.name);
      } finally {
        setDropImportProgress({ completed: index + 1, total: images.length });
      }
    }
    setDropImportProgress(null);

    if (failures.length || skippedCount) {
      const messages = [];
      if (failures.length) messages.push(`${failures.length} 张图片上传失败：${failures.join("、")}`);
      if (skippedCount) messages.push(`${skippedCount} 个非图片文件已跳过。`);
      window.alert(messages.join("\n"));
    }
  }, [addAssetNode, uploadAsset]);

  const handleCanvasDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasSystemFiles(event.dataTransfer)) return;
    event.preventDefault();
    systemFileDragDepthRef.current += 1;
    setSystemFileDragActive(true);
  }, []);

  const handleCanvasDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (systemFileDragDepthRef.current === 0) return;
    systemFileDragDepthRef.current = Math.max(0, systemFileDragDepthRef.current - 1);
    if (systemFileDragDepthRef.current === 0) setSystemFileDragActive(false);
  }, []);

  const handleCanvasDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const internalAsset = event.dataTransfer.getData("application/aigc-asset");
    systemFileDragDepthRef.current = 0;
    setSystemFileDragActive(false);

    if (internalAsset) {
      event.preventDefault();
      try {
        const asset = JSON.parse(internalAsset) as { assetId: string; type: string; url?: string; filePath?: string; thumbnailUrl?: string; width?: number; height?: number; duration?: number };
        addAssetNode(asset, screenToFlow({ x: event.clientX, y: event.clientY }));
      } catch {
        // Ignore malformed internal drag payloads.
      }
      return;
    }

    if (!hasSystemFiles(event.dataTransfer)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    const position = screenToFlow({ x: event.clientX, y: event.clientY });
    void importDroppedImages(files, position);
  }, [addAssetNode, importDroppedImages, screenToFlow]);

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
      onDragEnter={handleCanvasDragEnter}
      onDragLeave={handleCanvasDragLeave}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/aigc-asset") || hasSystemFiles(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={handleCanvasDrop}
    >
      {(systemFileDragActive || dropImportProgress) && (
        <div className={`canvas-file-drop-overlay ${dropImportProgress ? "is-importing" : ""}`} aria-live="polite">
          <div className="canvas-file-drop-message">
            <span className="canvas-file-drop-icon"><ImagePlus size={22} /></span>
            <strong>{dropImportProgress ? `正在导入图片 ${dropImportProgress.completed}/${dropImportProgress.total}` : "松开以添加图片素材"}</strong>
            <small>{dropImportProgress ? "上传完成后将自动创建图片素材节点" : "支持从 Finder 或外置文件夹拖入，可一次添加多张"}</small>
          </div>
        </div>
      )}
      {lastDeletion && (
        <div className="canvas-delete-undo-toast" role="status" aria-live="polite">
          <span className="canvas-delete-undo-copy">
            <strong>{lastDeletion.wasGenerating ? "生成节点已删除，任务仍在后台生成" : "节点已删除"}</strong>
            <small>{lastDeletion.wasGenerating ? "完成后可在历史记录或素材库找回" : "10 秒内可以恢复节点和连线"}</small>
          </span>
          {lastDeletion.wasGenerating && lastDeletion.historyTab && (
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.setItem("moon:history-tab", lastDeletion.historyTab || "video");
                window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "history" }));
              }}
            >
              <History size={15} />历史记录
            </button>
          )}
          <button type="button" className="is-primary" onClick={restoreLastDeletion}><Undo2 size={15} />撤销</button>
        </div>
      )}
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
        snapToGrid={snapToGrid}
        snapGrid={[24, 24]}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineComponent={StudioConnectionLine}
        connectionRadius={44}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <ZoomControls
          showGrid={showGrid}
          showMiniMap={showMiniMap}
          snapToGrid={snapToGrid}
          onToggleGrid={onToggleGrid}
          onToggleMiniMap={() => setShowMiniMap((value) => !value)}
          onToggleSnap={() => setSnapToGrid((value) => !value)}
          onOrganize={organizeAndFit}
        />
        {showMiniMap && (
          <MiniMap
            className="canvas-mini-map"
            nodeBorderRadius={8}
            nodeStrokeWidth={2}
            maskColor="rgba(0,0,0,0.42)"
            pannable
            zoomable
          />
        )}
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
