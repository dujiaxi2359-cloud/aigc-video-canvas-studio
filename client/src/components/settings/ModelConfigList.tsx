import { Plus } from "lucide-react";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import type { ModelConfig } from "../../types/model";

export function ModelConfigList({
  models,
  selectedId,
  onSelect,
  onCreate
}: {
  models: ModelConfig[];
  selectedId?: string;
  onSelect: (model: ModelConfig) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="w-[320px] shrink-0 rounded-2xl border border-white/[0.07] bg-[#13171f]/90 p-3.5 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
      <div className="mb-4 flex items-center justify-between px-1">
        <div>
          <h2 className="text-[16px] font-semibold text-[#f3f5f7]">模型配置中心</h2>
          <p className="mt-1 text-[12px] text-[#7d8796]">BYOK 模型列表</p>
        </div>
        <Button className="h-9 w-9 px-0" variant="primary" onClick={onCreate} title="新增模型">
          <Plus size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="space-y-2">
        {models.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onSelect(model)}
            className={`w-full rounded-[14px] border p-3 text-left transition ${
              selectedId === model.id
                ? "border-[#7c6cf6]/40 bg-[#7c6cf6]/[0.10]"
                : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[14px] font-semibold text-[#f3f5f7]">{model.displayName || model.modelName}</div>
              <Badge>{model.enabled ? "启用" : "停用"}</Badge>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#7d8796]">
              <span className="truncate">{model.provider}</span>
              <span>{model.modelType}</span>
            </div>
          </button>
        ))}
        {models.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-white/[0.08] p-4 text-[13px] leading-5 text-[#7d8796]">
            还没有模型配置。点击右上角新增一个你已有 API 的模型。
          </div>
        )}
      </div>
    </aside>
  );
}
