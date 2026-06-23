import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from "reactflow";
import { createClientId } from "../utils/id";
import type { AgentWorkflowPlan, AgentNodeType } from "../types/agent";
import type { WorkflowNodeType } from "../types/node";

const defaults: Record<WorkflowNodeType, unknown> = {
  textGenerate: { title: "Gemini 智能体", prompt: "", taskType: "prompt-polish", status: "idle" },
  text: { title: "文本节点", content: "" },
  image: { title: "图片素材" },
  imageGenerate: { title: "图片生成", prompt: "", inputMode: "text-to-image", aspectRatio: "1:1", generateCount: 1, status: "idle" },
  video: { title: "视频节点", prompt: "", inputMode: "text-to-video", videoMode: "text_to_video", generateCount: 1, status: "idle" },
  audio: { title: "音频节点" },
  script: {
    title: "脚本节点",
    shots: [{ id: createClientId("shot"), shotNumber: 1, duration: 5, visualDescription: "", prompt: "", subtitle: "", soundDesign: "" }]
  },
  compose: { title: "视频合成", inputVideoAssetIds: [], status: "idle" }
};

const nodeWidths: Record<WorkflowNodeType, number> = {
  textGenerate: 380,
  text: 300,
  image: 440,
  imageGenerate: 500,
  video: 500,
  audio: 320,
  script: 320,
  compose: 320
};

type State = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId?: string;
  addNode: (type: WorkflowNodeType, position?: { x: number; y: number }) => void;
  addAssetNode: (asset: { assetId: string; type: string; url?: string; filePath?: string; thumbnailUrl?: string; width?: number; height?: number; aspectRatio?: string; duration?: number }, position?: { x: number; y: number }) => void;
  addConnectedNode: (sourceId: string, type: WorkflowNodeType, position?: { x: number; y: number }, data?: Record<string, unknown>) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  deleteEdges: (ids: string[]) => void;
  deleteSelected: () => void;
  disconnectNode: (id: string) => void;
  disconnectNodeInputs: (id: string) => void;
  disconnectNodeOutputs: (id: string) => void;
  deleteUnconnectedNodes: () => void;
  clearCanvas: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectEdge: (id: string) => void;
  selectNode: (id: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  connectNodes: (connection: Connection) => void;
  loadProject: (nodes: Node[], edges: Edge[]) => void;
  getCanvasState: () => { nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>; edges: Array<{ id?: string; source: string; target: string }> };
  applyAgentWorkflowPlan: (plan: AgentWorkflowPlan) => void;
};

function mapAgentNodeType(type: AgentNodeType): WorkflowNodeType {
  if (type === "imageAsset") return "image";
  if (type === "videoGenerate") return "video";
  return type;
}

function nextPosition(nodes: Node[], position?: { x: number; y: number }) {
  if (position) return avoidOverlap(nodes, position);
  const index = nodes.length;
  return avoidOverlap(nodes, { x: 320 + index * 68, y: 110 + index * 42 });
}

function avoidOverlap(nodes: Node[], position: { x: number; y: number }) {
  let y = position.y;
  while (nodes.some((node) => Math.abs(node.position.x - position.x) < 140 && Math.abs(node.position.y - y) < 84)) y += 76;
  return { x: position.x, y };
}

function edgeStyle() {
  return { stroke: "rgba(226,232,240,0.34)", strokeWidth: 1.6 };
}

function createFlowEdge(sourceId: string, targetId: string): Edge {
  return { id: createClientId("edge"), source: sourceId, target: targetId, sourceHandle: "out", type: "studioEdge", animated: false, style: edgeStyle() };
}

function applyConnectionDefaults(nodes: Node[], sourceId?: string | null, targetId?: string | null) {
  if (!sourceId || !targetId) return nodes;
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  const isImageSource = source?.type === "image" || source?.type === "imageAsset" || source?.type === "imageGenerate";
  if (!isImageSource || target?.type !== "video") return nodes;
  const data = (target.data ?? {}) as Record<string, unknown>;
  const currentMode = String(data.videoMode ?? "text_to_video");
  if (currentMode !== "text_to_video") return nodes;
  return nodes.map((node) => node.id === targetId ? {
    ...node,
    data: {
      ...data,
      inputMode: "reference-to-video",
      videoMode: "reference_images_to_video",
      errorCode: undefined,
      errorMessage: undefined,
      debugMessage: undefined
    }
  } : node);
}

function ratioFromAsset(asset: { width?: number; height?: number; aspectRatio?: string }) {
  if (asset.aspectRatio) return asset.aspectRatio;
  if (!asset.width || !asset.height) return undefined;
  const value = asset.width / asset.height;
  if (Math.abs(value - 16 / 9) < 0.04) return "16:9";
  if (Math.abs(value - 9 / 16) < 0.04) return "9:16";
  if (Math.abs(value - 1) < 0.04) return "1:1";
  return `${asset.width}:${asset.height}`;
}

export const useCanvasStore = create<State>((set, get) => ({
  nodes: [],
  edges: [],
  addNode: (type, position) =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        { id: createClientId(type), type, dragHandle: ".drag-handle", position: nextPosition(state.nodes, position), data: defaults[type] }
      ]
    })),
  addAssetNode: (asset, position) =>
    set((state) => {
      const type: WorkflowNodeType = asset.type === "video" ? "video" : asset.type === "audio" ? "audio" : asset.type === "text" || asset.type === "script" ? "text" : "image";
      const data =
        type === "image"
          ? { ...(defaults.image as Record<string, unknown>), title: "图片素材", assetId: asset.assetId, url: asset.url, localPath: asset.filePath, thumbnailUrl: asset.thumbnailUrl, width: asset.width, height: asset.height, aspectRatio: ratioFromAsset(asset) }
          : type === "audio"
            ? { ...(defaults.audio as Record<string, unknown>), title: "音频素材", assetId: asset.assetId, url: asset.url }
            : type === "video"
              ? { ...(defaults.video as Record<string, unknown>), title: "视频素材", assetId: asset.assetId, outputAssetId: asset.assetId, outputUrl: asset.url, aspectRatio: ratioFromAsset(asset), duration: asset.duration, status: "success" }
              : { ...(defaults.text as Record<string, unknown>), title: "文本素材", content: "" };
      return {
        nodes: [
          ...state.nodes,
          { id: createClientId(type), type, dragHandle: ".drag-handle", position: nextPosition(state.nodes, position), data }
        ]
      };
    }),
  addConnectedNode: (sourceId, type, position, dataOverride) =>
    set((state) => {
      const source = state.nodes.find((node) => node.id === sourceId);
      if (!source) return {};
      const sourceType = source.type as WorkflowNodeType;
      const targetPosition = avoidOverlap(state.nodes, position ?? { x: source.position.x + nodeWidths[sourceType] + 180, y: source.position.y + 20 });
      const targetId = createClientId(type);
      const targetNode: Node = {
        id: targetId,
        type,
        dragHandle: ".drag-handle",
        position: targetPosition,
        data: {
          ...(defaults[type] as Record<string, unknown>),
          referencedFrom: { sourceNodeId: sourceId, sourceNodeType: source.type },
          ...(dataOverride ?? {})
        }
      };
      const nextNodes = [...state.nodes, targetNode];
      return { nodes: applyConnectionDefaults(nextNodes, sourceId, targetId), edges: addEdge(createFlowEdge(sourceId, targetId), state.edges) };
    }),
  updateNodeData: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== id) return node;
        const currentData = (node.data ?? {}) as Record<string, unknown>;
        const nextData = { ...currentData, ...data };
        const changed = Object.keys(data).some((key) => currentData[key] !== nextData[key]);
        return changed ? { ...node, data: nextData } : node;
      })
    })),
  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      selectedNodeId: state.selectedNodeId === id ? undefined : state.selectedNodeId
    })),
  duplicateNode: (id) =>
    set((state) => {
      const source = state.nodes.find((node) => node.id === id);
      if (!source) return {};
      const type = (source.type as WorkflowNodeType) ?? "text";
      const duplicated: Node = {
        ...source,
        id: createClientId(type),
        selected: true,
        position: avoidOverlap(state.nodes, { x: source.position.x + 42, y: source.position.y + 42 }),
        data: { ...((source.data ?? {}) as Record<string, unknown>), title: `${(source.data as { title?: string } | undefined)?.title ?? "节点"} Copy` }
      };
      return {
        nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), duplicated],
        edges: state.edges.map((edge) => ({ ...edge, selected: false })),
        selectedNodeId: duplicated.id
      };
    }),
  deleteEdge: (id) => set((state) => ({ edges: state.edges.filter((edge) => edge.id !== id) })),
  deleteEdges: (ids) => set((state) => ({ edges: state.edges.filter((edge) => !ids.includes(edge.id)) })),
  deleteSelected: () =>
    set((state) => {
      const selectedNodeIds = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
      const selectedEdgeIds = new Set(state.edges.filter((edge) => edge.selected).map((edge) => edge.id));
      if (!selectedNodeIds.size && !selectedEdgeIds.size) return {};
      return {
        nodes: state.nodes.filter((node) => !selectedNodeIds.has(node.id)),
        edges: state.edges.filter((edge) => !selectedEdgeIds.has(edge.id) && !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)),
        selectedNodeId: selectedNodeIds.has(state.selectedNodeId ?? "") ? undefined : state.selectedNodeId
      };
    }),
  disconnectNode: (id) => set((state) => ({ edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id) })),
  disconnectNodeInputs: (id) => set((state) => ({ edges: state.edges.filter((edge) => edge.target !== id) })),
  disconnectNodeOutputs: (id) => set((state) => ({ edges: state.edges.filter((edge) => edge.source !== id) })),
  deleteUnconnectedNodes: () =>
    set((state) => {
      const connected = new Set(state.edges.flatMap((edge) => [edge.source, edge.target]));
      return { nodes: state.nodes.filter((node) => connected.has(node.id)) };
    }),
  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: undefined }),
  selectAll: () => set((state) => ({ selectedNodeId: state.nodes[0]?.id, nodes: state.nodes.map((node) => ({ ...node, selected: true })), edges: state.edges.map((edge) => ({ ...edge, selected: true })) })),
  clearSelection: () => set((state) => ({ selectedNodeId: undefined, nodes: state.nodes.map((node) => ({ ...node, selected: false })), edges: state.edges.map((edge) => ({ ...edge, selected: false })) })),
  selectEdge: (id) => set((state) => ({ selectedNodeId: undefined, nodes: state.nodes.map((node) => ({ ...node, selected: false })), edges: state.edges.map((edge) => ({ ...edge, selected: edge.id === id })) })),
  selectNode: (id) => set((state) => ({ selectedNodeId: id, nodes: state.nodes.map((node) => ({ ...node, selected: node.id === id })), edges: state.edges.map((edge) => ({ ...edge, selected: false })) })),
  onNodesChange: (changes) => set((state) => {
    const nodes = applyNodeChanges(changes, state.nodes);
    const selectedNodeId = nodes.find((node) => node.selected)?.id;
    return { nodes, selectedNodeId };
  }),
  onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  connectNodes: (connection) => set((state) => ({
    nodes: applyConnectionDefaults(state.nodes, connection.source, connection.target),
    edges: addEdge({ ...connection, type: "studioEdge", animated: true, style: edgeStyle() }, state.edges)
  })),
  loadProject: (nodes, edges) => set({ nodes, edges, selectedNodeId: nodes.find((node) => node.selected)?.id }),
  getCanvasState: () => {
    const state = get();
    return {
      nodes: state.nodes.map((node) => ({ id: node.id, type: node.type, data: node.data as Record<string, unknown> | undefined })),
      edges: state.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
    };
  },
  applyAgentWorkflowPlan: (plan) =>
    set((state) => {
      const baseX = 160 + state.nodes.length * 24;
      const baseY = 120 + state.nodes.length * 18;
      const idByTempId = new Map<string, string>();
      const plannedNodes = plan.nodes.map((planned, index) => {
        const type = mapAgentNodeType(planned.type);
        const id = createClientId(type);
        idByTempId.set(planned.tempId, id);
        const position = avoidOverlap([...state.nodes], {
          x: baseX + (planned.position?.x ?? index * 360),
          y: baseY + (planned.position?.y ?? 0)
        });
        return {
          id,
          type,
          dragHandle: ".drag-handle",
          position,
          data: {
            ...(defaults[type] as Record<string, unknown>),
            title: planned.title,
            ...(planned.data ?? {}),
            createdByAgent: true
          }
        } satisfies Node;
      });

      const plannedEdges = plan.edges.flatMap((edge) => {
        const source = idByTempId.get(edge.sourceTempId);
        const target = idByTempId.get(edge.targetTempId);
        return source && target ? [createFlowEdge(source, target)] : [];
      });

      return {
        nodes: [...state.nodes, ...plannedNodes],
        edges: [...state.edges, ...plannedEdges],
        selectedNodeId: plannedNodes[0]?.id ?? state.selectedNodeId
      };
    })
}));
