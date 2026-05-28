import { Trash2 } from "lucide-react";
import { Button } from "../common/Button";
import { ModelConfigForm } from "./ModelConfigForm";
import type { ModelConfig } from "../../types/model";

export function ModelConfigDetail({
  model,
  creating,
  onCancel,
  onSubmit,
  onDelete,
  onTest,
  saving,
  errorMessage,
  successMessage
}: {
  model?: ModelConfig;
  creating: boolean;
  onCancel: () => void;
  onSubmit: (data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  onDelete?: () => void;
  onTest?: () => Promise<string>;
  saving?: boolean;
  errorMessage?: string;
  successMessage?: string;
}) {
  if (!creating && !model) {
    return (
      <section className="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.72] p-8 text-center">
        <div>
          <div className="text-[16px] font-semibold text-[#f3f5f7]">选择或新增一个模型</div>
          <p className="mt-2 max-w-md text-[13px] leading-6 text-[#7d8796]">
            API Key 只会在这里填写并交给后端加密保存。画布节点只引用 modelConfigId。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.92] p-[18px] shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#f3f5f7]">{creating ? "新增模型" : model?.displayName}</h2>
          <p className="mt-1 text-[12px] text-[#7d8796]">设置中心是唯一配置 API Key 与 API Base URL 的地方。</p>
        </div>
        {model && onDelete && (
          <Button variant="danger" className="h-9" onClick={onDelete} type="button">
            <Trash2 size={14} strokeWidth={1.8} /> 删除
          </Button>
        )}
      </div>

      {errorMessage && <div className="mb-4 rounded-xl border border-red-300/[0.16] bg-red-400/[0.08] px-3 py-2 text-[13px] leading-5 text-red-200">{errorMessage}</div>}
      {successMessage && <div className="mb-4 rounded-xl border border-emerald-300/[0.16] bg-emerald-400/[0.08] px-3 py-2 text-[13px] leading-5 text-emerald-200">{successMessage}</div>}

      <ModelConfigForm key={model?.id ?? "new-model"} model={model} onCancel={onCancel} onSubmit={onSubmit} onTest={onTest} saving={saving} />
    </section>
  );
}
