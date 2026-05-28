import { ProviderError } from "../../utils/providerErrors.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

export async function generateVideoWithGrok(_params: VideoProviderParams): Promise<ProviderGenerateResult> {
  throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Grok Imagine 真实任务创建与轮询尚未完整接入，请接入 xAI 视频生成接口。");
}
