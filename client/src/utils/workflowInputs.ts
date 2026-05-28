import type { Edge, Node } from "reactflow";

export type AssetInput = {
  nodeId: string;
  sourceNodeId: string;
  nodeType?: string;
  sourceNodeType?: string;
  assetId?: string;
  url?: string;
  localPath?: string;
  publicUrl?: string;
  mimeType?: string;
};

function toAssetInput(node: Node): AssetInput {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return {
    nodeId: node.id,
    sourceNodeId: node.id,
    nodeType: node.type,
    sourceNodeType: node.type,
    assetId: (data.assetId ?? data.outputAssetId) as string | undefined,
    url: (data.url ?? data.imageUrl ?? data.outputUrl) as string | undefined,
    localPath: data.localPath as string | undefined,
    publicUrl: data.publicUrl as string | undefined,
    mimeType: data.mimeType as string | undefined
  };
}

function isUsableInput(input: AssetInput) {
  return Boolean(input.assetId || input.url || input.localPath);
}

function incomingNodes(nodeId: string, nodes: Node[], edges: Edge[]) {
  return edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter(Boolean) as Node[];
}

function isImageNode(node?: Node) {
  return node?.type === "image" || node?.type === "imageAsset" || node?.type === "imageGenerate";
}

function isVideoNode(node?: Node) {
  return node?.type === "video" || node?.type === "videoAsset" || node?.type === "videoGenerate";
}

function isAudioNode(node?: Node) {
  return node?.type === "audio";
}

export function resolveImageNodeInputs(nodeId: string, nodes: Node[], edges: Edge[]) {
  const imageInputs = incomingNodes(nodeId, nodes, edges)
    .filter(isImageNode)
    .map(toAssetInput)
    .filter(isUsableInput);

  return {
    imageInputs,
    hasImageInput: imageInputs.length > 0
  };
}

export function resolveVideoNodeInputs(nodeId: string, nodes: Node[], edges: Edge[]) {
  const sources = incomingNodes(nodeId, nodes, edges);
  const imageInputs = sources.filter(isImageNode).map(toAssetInput).filter(isUsableInput);
  const videoInputs = sources.filter(isVideoNode).map(toAssetInput).filter(isUsableInput);
  const audioInputs = sources.filter(isAudioNode).map(toAssetInput).filter(isUsableInput);

  return {
    imageInputs,
    videoInputs,
    audioInputs,
    hasImageInput: imageInputs.length > 0,
    hasVideoInput: videoInputs.length > 0,
    hasReferenceImage: imageInputs.length > 0,
    hasFirstFrame: imageInputs.length > 0,
    hasLastFrame: imageInputs.length > 1,
    hasFirstLastFrame: imageInputs.length > 1
  };
}

export function compactAssetIds(inputs: AssetInput[]) {
  return inputs.map((input) => input.assetId).filter(Boolean) as string[];
}
