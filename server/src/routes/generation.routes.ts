import { Router } from "express";
import { getGenerationTask, getLatestGenerationTaskForNode } from "../services/generationTask.service.js";
import { generateImage, generateText, generateVideo } from "../services/model.service.js";
import { isProviderError } from "../utils/providerErrors.js";
import { assertCreditsAvailable, assertWorkspaceFeature, consumeCredits } from "../services/billing.service.js";

export const generationRouter = Router();

const VIDEO_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const VIDEO_INITIAL_RESPONSE_WAIT_MS = 15 * 1000;
const inflightVideoRequests = new Map<string, { createdAt: number; settledAt?: number; promise: Promise<unknown> }>();

function videoIdempotencyKey(body: any) {
  const clientRequestId = typeof body?.clientRequestId === "string" ? body.clientRequestId : "";
  const nodeId = typeof body?.nodeId === "string" ? body.nodeId : "";
  const modelConfigId = typeof body?.modelConfigId === "string" ? body.modelConfigId : "";
  if (!clientRequestId || !nodeId || !modelConfigId) return "";
  return `${nodeId}:${modelConfigId}:${clientRequestId}`;
}

function rememberVideoRequest<T>(key: string, create: () => Promise<T>) {
  const now = Date.now();
  for (const [entryKey, entry] of inflightVideoRequests) {
    if (entry.settledAt && now - entry.settledAt > VIDEO_IDEMPOTENCY_TTL_MS) inflightVideoRequests.delete(entryKey);
  }
  if (!key) return create();
  const existing = inflightVideoRequests.get(key);
  if (existing) return existing.promise as Promise<T>;
  const promise = create();
  const entry = { createdAt: now, promise } as { createdAt: number; settledAt?: number; promise: Promise<T> };
  inflightVideoRequests.set(key, entry);
  promise.finally(() => {
    entry.settledAt = Date.now();
    setTimeout(() => {
      const entry = inflightVideoRequests.get(key);
      if (entry?.promise === promise) inflightVideoRequests.delete(key);
    }, VIDEO_IDEMPOTENCY_TTL_MS);
  }).catch(() => undefined);
  return promise;
}

function isQuotaError(text: string) {
  return /PUBLIC_ERROR_USER_QUOTA_REACHED|USER_QUOTA_REACHED|RESOURCE_EXHAUSTED|token quota|quota is not enough|quota|credit|balance|insufficient|exhausted|余额不足|额度不足|额度耗尽/i.test(text);
}

function isChannelUnavailable(text: string) {
  return /无可用渠道|可用渠道不存在|所有分组.*模型|当前分组.*模型|分组.*模型.*(?:调用权限|权限)|distributor|no available channel|channel.*unavailable/i.test(text);
}

function isSafetyReviewRejection(text: string) {
  return /官方安全审核拒绝|审核|安全|违规|safety system|safety[_\s-]?violations|content policy|policy violation|moderation|blocked|filtered|rejected by the safety|RAI|privacy|隐私/i.test(text);
}

function isReferenceBlockedByPolicy(text: string) {
  return /Reference upload failed|image reference\s*\d+\s*blocked|previously flagged|content policy|policy violation|素材.*(?:审核|拦截|违规)|参考图.*(?:审核|拦截|违规)/i.test(text);
}

function channelUnavailableMessage(text: string) {
  const modelName = text.match(/模型\s*[「"']?([A-Za-z0-9._-]+)[」"']?/i)?.[1]
    ?? text.match(/model\s*[:"']+\s*([A-Za-z0-9._-]+)/i)?.[1];
  const modelPart = modelName ? `「${modelName}」` : "当前模型";
  return `通道权限问题：当前中转账号/分组没有${modelPart}的可用渠道。请在设置中心切换到已开通的线路，或让中转后台开通该模型；这不是提示词、素材或额度问题。`;
}

function referenceBlockedMessage(text: string) {
  const referenceIndex = text.match(/image reference\s*(\d+)\s*blocked/i)?.[1]
    ?? text.match(/参考图\s*(\d+)/i)?.[1];
  const target = referenceIndex ? `第 ${referenceIndex} 张参考图` : "参考图素材";
  return `素材审核拦截：${target}被上游内容策略拦截或曾被标记。请删除/替换这张素材后重试；这不是额度问题，也不是接口路径问题。`;
}

function isUpstreamTimeoutOrGateway(text: string) {
  return /Cloudflare|error 524|a timeout occurred|origin web server timed out|gateway|502|503|504|upstream.*timeout|上游.*超时|中转.*超时|服务不可用/i.test(text);
}

function isTerminalGenerationFailure(text: string) {
  return isQuotaError(text)
    || isChannelUnavailable(text)
    || isSafetyReviewRejection(text)
    || /unauthorized|invalid api key|incorrect api key|forbidden|permission|access denied|无权限|未开通/i.test(text);
}

function submittedTaskSignal(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const taskId = record.taskId ?? record.task_id ?? record.proxyTaskId ?? record.id ?? record.requestId ?? record.request_id ?? record.jobId ?? record.job_id;
  const status = record.taskStatus ?? record.task_status ?? record.status ?? record.state;
  if (typeof taskId === "string" && taskId.length > 0) return record;
  if (record.pendingAfterTimeout === true || record.pendingAfterPollInterruption === true || record.pendingInBackground === true) return record;
  if (typeof status === "string" && /processing|pending|queued|submitted|running|in_progress|生成中|排队|已提交/i.test(status)) return record;
  for (const nested of [record.payloadSummary, record.response, record.result, record.data, record.output]) {
    const found = submittedTaskSignal(nested);
    if (found) return found;
  }
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const found = submittedTaskSignal(item);
      if (found) return found;
    }
  }
  return undefined;
}

function generationError(error: unknown) {
  if (isProviderError(error)) {
    const raw = `${error.message}\n${error.debugMessage ?? ""}`;
    const submitted = submittedTaskSignal(error.details);
    if (submitted && !isTerminalGenerationFailure(raw)) {
      return {
        status: "processing" as const,
        payloadSummary: {
          ...submitted,
          providerErrorCode: error.errorCode,
          message: "上游任务已提交，当前仍在生成中。"
        }
      };
    }
    if (isReferenceBlockedByPolicy(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_REFERENCE_BLOCKED",
        errorMessage: referenceBlockedMessage(raw),
        debugMessage: error.debugMessage,
        payloadSummary: error.details
      };
    }
    if (isChannelUnavailable(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
        errorMessage: channelUnavailableMessage(raw),
        debugMessage: error.debugMessage,
        payloadSummary: error.details
      };
    }
    if (isSafetyReviewRejection(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_HUMAN_PRIVACY_REVIEW",
        errorMessage: `官方/上游安全审核拒绝：${error.message}`,
        debugMessage: error.debugMessage,
        payloadSummary: error.details
      };
    }
    if (isUpstreamTimeoutOrGateway(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
        errorMessage: `中转/上游线路超时或不可用：${error.message}`,
        debugMessage: error.debugMessage,
        payloadSummary: error.details
      };
    }
    if (isQuotaError(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
        errorMessage: "额度不足"
      };
    }
    return {
      status: "error" as const,
      errorCode: error.errorCode,
      errorMessage: error.message,
      debugMessage: error.debugMessage,
      payloadSummary: error.details
    };
  }
  const message = error instanceof Error ? error.message : "生成失败";
  if (isReferenceBlockedByPolicy(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_REFERENCE_BLOCKED",
      errorMessage: referenceBlockedMessage(message),
      debugMessage: message
    };
  }
  if (isChannelUnavailable(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
      errorMessage: channelUnavailableMessage(message),
      debugMessage: message
    };
  }
  if (isSafetyReviewRejection(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_HUMAN_PRIVACY_REVIEW",
      errorMessage: `官方/上游安全审核拒绝：${message}`
    };
  }
  if (isUpstreamTimeoutOrGateway(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
      errorMessage: `中转/上游线路超时或不可用：${message}`
    };
  }
  if (isQuotaError(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
      errorMessage: "额度不足"
    };
  }
  return {
    status: "error" as const,
    errorCode: /fetch failed/i.test(message) ? "NETWORK_ERROR" : "PROVIDER_ERROR",
    errorMessage: /fetch failed/i.test(message) ? "网络请求失败，请检查本地服务、代理、接口地址或第三方 API 网络连接是否正常。" : message,
    debugMessage: /fetch failed/i.test(message) ? message : undefined
  };
}

generationRouter.post("/video", async (req, res) => {
  try {
    const key = videoIdempotencyKey(req.body);
    const work = rememberVideoRequest(key, async () => {
      await assertWorkspaceFeature("video_generation"); await assertCreditsAvailable(1);
      const generated = await generateVideo(req.body);
      if ((generated as any)?.status !== "error") await consumeCredits({ actionType: "video_generation", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId, metadata: { projectId: req.body?.projectId, nodeId: req.body?.nodeId } });
      return generated;
    });
    const pending = Symbol("video-pending");
    const result = await Promise.race([
      work,
      new Promise<typeof pending>((resolve) => setTimeout(() => resolve(pending), VIDEO_INITIAL_RESPONSE_WAIT_MS))
    ]);
    if (result === pending) {
      res.json({
        status: "processing",
        payloadSummary: {
          clientRequestId: req.body?.clientRequestId,
          nodeId: req.body?.nodeId,
          pendingInBackground: true,
          message: "上游任务仍在排队或生成中，完成后将自动回填画布。"
        }
      });
      return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.post("/image", async (req, res) => {
  try {
    await assertWorkspaceFeature("image_generation"); await assertCreditsAvailable(1);
    const result = await generateImage(req.body);
    if ((result as any)?.status !== "error") await consumeCredits({ actionType: "image_generation", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId, metadata: { projectId: req.body?.projectId, nodeId: req.body?.nodeId } });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.post("/text", async (req, res) => {
  try {
    await assertWorkspaceFeature("agent"); await assertCreditsAvailable(1);
    const result = await generateText(req.body);
    if ((result as any)?.status !== "error") await consumeCredits({ actionType: "agent", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.get("/tasks/latest", async (req, res) => {
  const nodeId = typeof req.query.nodeId === "string" ? req.query.nodeId.trim() : "";
  const since = typeof req.query.since === "string" ? Number(req.query.since) : undefined;
  if (!nodeId) {
    res.status(400).json({ status: "error", errorMessage: "缺少节点 ID。" });
    return;
  }
  const task = await getLatestGenerationTaskForNode(nodeId, since);
  if (!task) {
    res.status(404).json({ status: "error", errorMessage: "未找到该节点对应的上游任务。" });
    return;
  }
  res.json(task);
});

generationRouter.get("/tasks/:id", async (req, res) => {
  const task = await getGenerationTask(req.params.id);
  if (!task) {
    res.status(404).json({ status: "error", errorMessage: "未找到该生成任务。" });
    return;
  }
  res.json(task);
});
