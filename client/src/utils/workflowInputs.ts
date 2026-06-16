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
  return Array.from(new Set(inputs.map((input) => input.assetId).filter(Boolean) as string[]));
}

export type ResolvedVideoInputs = ReturnType<typeof resolveVideoNodeInputs>;

function appendUnique(target: AssetInput[], input: AssetInput | undefined) {
  if (!input) return;
  const key = input.assetId ?? input.sourceNodeId ?? input.nodeId;
  if (target.some((item) => (item.assetId ?? item.sourceNodeId ?? item.nodeId) === key)) return;
  target.push(input);
}

export function resolvePromptReferencedVideoInputs(prompt: string, resolved: ResolvedVideoInputs) {
  const imageInputs: AssetInput[] = [];
  const videoInputs: AssetInput[] = [];
  const audioInputs: AssetInput[] = [];
  const allInputs = [
    ...resolved.imageInputs.map((input) => ({ type: "image" as const, input })),
    ...resolved.videoInputs.map((input) => ({ type: "video" as const, input })),
    ...resolved.audioInputs.map((input) => ({ type: "audio" as const, input }))
  ];
  const missing: string[] = [];

  const addByType = (type: "image" | "video" | "audio", index: number, label: string) => {
    const source = type === "image" ? resolved.imageInputs[index] : type === "video" ? resolved.videoInputs[index] : resolved.audioInputs[index];
    if (!source) {
      missing.push(label);
      return;
    }
    if (type === "image") appendUnique(imageInputs, source);
    if (type === "video") appendUnique(videoInputs, source);
    if (type === "audio") appendUnique(audioInputs, source);
  };

  for (const match of prompt.matchAll(/@(?:素材|参考素材)\s*(\d+)/gi)) {
    const label = match[0] ?? "";
    const item = allInputs[Math.max(0, Number(match[1]) - 1)];
    if (!item) {
      missing.push(label);
    } else {
      if (item.type === "image") appendUnique(imageInputs, item.input);
      if (item.type === "video") appendUnique(videoInputs, item.input);
      if (item.type === "audio") appendUnique(audioInputs, item.input);
    }
  }
  for (const match of prompt.matchAll(/@(?:图像|图片|参考图|image)\s*(\d+)/gi)) addByType("image", Math.max(0, Number(match[1]) - 1), match[0] ?? "");
  for (const match of prompt.matchAll(/@(?:视频|video)\s*(\d+)/gi)) addByType("video", Math.max(0, Number(match[1]) - 1), match[0] ?? "");
  for (const match of prompt.matchAll(/@(?:音频|audio)\s*(\d+)/gi)) addByType("audio", Math.max(0, Number(match[1]) - 1), match[0] ?? "");

  const hasPromptReferences = imageInputs.length + videoInputs.length + audioInputs.length + missing.length > 0;
  if (!hasPromptReferences) return { ...resolved, hasPromptReferences: false, missingPromptReferences: [] as string[] };

  return {
    imageInputs,
    videoInputs,
    audioInputs,
    hasImageInput: imageInputs.length > 0,
    hasVideoInput: videoInputs.length > 0,
    hasReferenceImage: imageInputs.length > 0,
    hasFirstFrame: imageInputs.length > 0,
    hasLastFrame: imageInputs.length > 1,
    hasFirstLastFrame: imageInputs.length > 1,
    hasPromptReferences: true,
    missingPromptReferences: missing
  };
}
