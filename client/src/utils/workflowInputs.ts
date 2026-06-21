import type { Edge, Node } from "reactflow";

export type AssetInput = {
  nodeId: string;
  sourceNodeId: string;
  nodeType?: string;
  sourceNodeType?: string;
  title?: string;
  assetId?: string;
  url?: string;
  thumbnailUrl?: string;
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
    title: (data.title ?? data.name ?? data.fileName) as string | undefined,
    assetId: (data.assetId ?? data.outputAssetId) as string | undefined,
    url: (data.url ?? data.imageUrl ?? data.outputUrl) as string | undefined,
    thumbnailUrl: data.thumbnailUrl as string | undefined,
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

export type ResolvedImageInputs = ReturnType<typeof resolveImageNodeInputs>;

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

export type PromptImageReferenceBinding = {
  token: string;
  label: string;
  kind: "image";
  kindLabel: "图片";
  kindIndex: number;
  globalIndex: number;
  sourceNodeId: string;
  assetId?: string;
  title?: string;
};

export function resolvePromptReferencedImageInputs(prompt: string, resolved: ResolvedImageInputs) {
  const imageInputs: AssetInput[] = [];
  const missing: string[] = [];
  const bindings: PromptImageReferenceBinding[] = [];

  const addBinding = (input: AssetInput, token: string, index: number) => {
    const key = `${token}:${input.assetId ?? input.sourceNodeId ?? input.nodeId}`;
    if (bindings.some((binding) => `${binding.token}:${binding.assetId ?? binding.sourceNodeId}` === key)) return;
    bindings.push({
      token,
      label: `参考图片${index + 1}`,
      kind: "image",
      kindLabel: "图片",
      kindIndex: index + 1,
      globalIndex: index + 1,
      sourceNodeId: input.sourceNodeId,
      assetId: input.assetId,
      title: input.title
    });
  };

  const addByIndex = (index: number, label: string) => {
    const source = resolved.imageInputs[index];
    if (!source) {
      missing.push(label);
      return;
    }
    appendUnique(imageInputs, source);
    addBinding(source, label, index);
  };

  for (const match of prompt.matchAll(/@(?:素材|参考素材|图像|图片|参考图|image)\s*(\d+)/gi)) {
    addByIndex(Math.max(0, Number(match[1]) - 1), match[0] ?? "");
  }

  const hasPromptReferences = imageInputs.length + missing.length > 0;
  if (!hasPromptReferences) return { ...resolved, hasPromptReferences: false, missingPromptReferences: [] as string[] };

  return {
    imageInputs,
    hasImageInput: imageInputs.length > 0,
    hasPromptReferences: true,
    missingPromptReferences: missing,
    referenceBindings: bindings,
    referencePrompt: buildReferenceAwareImagePrompt(prompt, bindings)
  };
}

export type ResolvedVideoInputs = ReturnType<typeof resolveVideoNodeInputs>;

export type PromptReferenceBinding = {
  token: string;
  label: string;
  kind: "image" | "video" | "audio";
  kindLabel: string;
  kindIndex: number;
  globalIndex: number;
  sourceNodeId: string;
  assetId?: string;
  title?: string;
};

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
    ...resolved.imageInputs.map((input, index) => ({ type: "image" as const, input, kindIndex: index + 1 })),
    ...resolved.videoInputs.map((input, index) => ({ type: "video" as const, input, kindIndex: index + 1 })),
    ...resolved.audioInputs.map((input, index) => ({ type: "audio" as const, input, kindIndex: index + 1 }))
  ];
  const missing: string[] = [];
  const bindings: PromptReferenceBinding[] = [];

  const kindLabel = (type: PromptReferenceBinding["kind"]) => type === "image" ? "图片" : type === "video" ? "视频" : "音频";
  const addBinding = (
    type: PromptReferenceBinding["kind"],
    input: AssetInput,
    token: string,
    kindIndex: number,
    globalIndex: number
  ) => {
    const key = `${token}:${input.assetId ?? input.sourceNodeId ?? input.nodeId}`;
    if (bindings.some((binding) => `${binding.token}:${binding.assetId ?? binding.sourceNodeId}` === key)) return;
    bindings.push({
      token,
      label: `参考素材${globalIndex}`,
      kind: type,
      kindLabel: kindLabel(type),
      kindIndex,
      globalIndex,
      sourceNodeId: input.sourceNodeId,
      assetId: input.assetId,
      title: input.title
    });
  };

  const addByType = (type: "image" | "video" | "audio", index: number, label: string) => {
    const source = type === "image" ? resolved.imageInputs[index] : type === "video" ? resolved.videoInputs[index] : resolved.audioInputs[index];
    if (!source) {
      missing.push(label);
      return;
    }
    if (type === "image") appendUnique(imageInputs, source);
    if (type === "video") appendUnique(videoInputs, source);
    if (type === "audio") appendUnique(audioInputs, source);
    const globalIndex = allInputs.findIndex((item) => item.input === source) + 1;
    addBinding(type, source, label, index + 1, globalIndex || index + 1);
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
      addBinding(item.type, item.input, label, item.kindIndex, Math.max(1, Number(match[1])));
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
    missingPromptReferences: missing,
    referenceBindings: bindings,
    referencePrompt: buildReferenceAwareVideoPrompt(prompt, bindings)
  };
}

function readableAssetTitle(input?: Pick<AssetInput, "title" | "sourceNodeId" | "assetId">) {
  const title = String(input?.title ?? "").trim();
  if (title) return title.slice(0, 48);
  return input?.assetId ?? input?.sourceNodeId ?? "未命名素材";
}

function buildAutoReferenceBindings(resolved: Pick<ResolvedVideoInputs, "imageInputs" | "videoInputs" | "audioInputs">): PromptReferenceBinding[] {
  const bindings: PromptReferenceBinding[] = [];
  let globalIndex = 1;
  const push = (kind: PromptReferenceBinding["kind"], inputs: AssetInput[]) => {
    inputs.forEach((input, index) => {
      bindings.push({
        token: `@素材${globalIndex}`,
        label: `参考素材${globalIndex}`,
        kind,
        kindLabel: kind === "image" ? "图片" : kind === "video" ? "视频" : "音频",
        kindIndex: index + 1,
        globalIndex,
        sourceNodeId: input.sourceNodeId,
        assetId: input.assetId,
        title: input.title
      });
      globalIndex += 1;
    });
  };
  push("image", resolved.imageInputs);
  push("video", resolved.videoInputs);
  push("audio", resolved.audioInputs);
  return bindings;
}

function buildAutoImageReferenceBindings(resolved: Pick<ResolvedImageInputs, "imageInputs">): PromptImageReferenceBinding[] {
  return resolved.imageInputs.map((input, index) => ({
    token: `@素材${index + 1}`,
    label: `参考图片${index + 1}`,
    kind: "image",
    kindLabel: "图片",
    kindIndex: index + 1,
    globalIndex: index + 1,
    sourceNodeId: input.sourceNodeId,
    assetId: input.assetId,
    title: input.title
  }));
}

export function buildReferenceAwareImagePrompt(prompt: string, bindingsOrInputs: PromptImageReferenceBinding[] | Pick<ResolvedImageInputs, "imageInputs">) {
  const bindings = Array.isArray(bindingsOrInputs) ? bindingsOrInputs : buildAutoImageReferenceBindings(bindingsOrInputs);
  if (!bindings.length) return prompt;

  let normalizedPrompt = prompt;
  const sorted = [...bindings].sort((a, b) => b.token.length - a.token.length);
  for (const binding of sorted) {
    normalizedPrompt = normalizedPrompt.split(binding.token).join(binding.label);
  }

  const seen = new Set<string>();
  const rows = bindings
    .filter((binding) => {
      const key = `${binding.label}:${binding.assetId ?? binding.sourceNodeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((binding) => `${binding.label} = 图片${binding.kindIndex}「${readableAssetTitle(binding)}」`);

  return [
    "【图文参考绑定】",
    ...rows,
    "请严格按照用户描述中的参考图片编号理解主体、产品、场景、风格和构图关系。",
    "",
    `【用户创意】${normalizedPrompt.trim() || "请根据参考图片生成可用内容。"}`
  ].join("\n");
}

export function buildReferenceAwareVideoPrompt(prompt: string, bindingsOrInputs: PromptReferenceBinding[] | Pick<ResolvedVideoInputs, "imageInputs" | "videoInputs" | "audioInputs">) {
  const bindings = Array.isArray(bindingsOrInputs) ? bindingsOrInputs : buildAutoReferenceBindings(bindingsOrInputs);
  if (!bindings.length) return prompt;

  let normalizedPrompt = prompt;
  const sorted = [...bindings].sort((a, b) => b.token.length - a.token.length);
  for (const binding of sorted) {
    normalizedPrompt = normalizedPrompt.split(binding.token).join(binding.label);
  }

  const seen = new Set<string>();
  const rows = bindings
    .filter((binding) => {
      const key = `${binding.label}:${binding.assetId ?? binding.sourceNodeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((binding) => `${binding.label} = ${binding.kindLabel}${binding.kindIndex}「${readableAssetTitle(binding)}」`);

  return [
    "【全能参考绑定】",
    ...rows,
    "请严格按照用户描述中的参考素材编号理解主体、场景、动作、风格、构图和音频关系。例如“参考素材2 在 参考素材1”表示把参考素材2中的主体/元素放入或作用于参考素材1提供的画面语境。",
    "",
    `【用户创意】${normalizedPrompt.trim() || "请根据参考素材生成自然连贯的视频。"}`
  ].join("\n");
}
