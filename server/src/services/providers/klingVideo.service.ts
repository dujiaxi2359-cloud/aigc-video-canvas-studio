import { ProviderError } from "../../utils/providerErrors.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

export async function generateVideoWithKling(_params: VideoProviderParams): Promise<ProviderGenerateResult> {
  throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "可灵真实任务创建与轮询尚未完整接入，请按照可灵开放平台接口补齐视频生成流程。");
}
