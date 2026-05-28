import type { ModelConfig } from "../../types/model";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

export function ProviderCard({ model, onEdit, onDelete }: { model: ModelConfig; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-studio-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{model.displayName}</h3>
          <div className="mt-1 text-sm text-slate-400">{model.provider} / {model.modelName}</div>
          <div className="mt-2 flex gap-2">
            <Badge>{model.modelType}</Badge>
            <Badge>{model.enabled ? "已启用" : "已停用"}</Badge>
            {model.maskedApiKey && <Badge>{model.maskedApiKey}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="bg-white/10" onClick={onEdit}>编辑</Button>
          <Button className="bg-red-500/80" onClick={onDelete}>删除</Button>
        </div>
      </div>
    </div>
  );
}
