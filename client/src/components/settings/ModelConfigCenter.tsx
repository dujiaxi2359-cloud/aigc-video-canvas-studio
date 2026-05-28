import { useEffect, useMemo, useState } from "react";
import { ModelConfigDetail } from "./ModelConfigDetail";
import { ModelConfigList } from "./ModelConfigList";
import { useModelConfigStore } from "../../store/modelConfigStore";
import type { ModelConfig } from "../../types/model";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "保存失败，请确认后端服务已启动。";
}

export function ModelConfigCenter() {
  const { modelConfigs, fetchModelConfigs, createModelConfig, updateModelConfig, deleteModelConfig, testModelConfig } = useModelConfigStore();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    fetchModelConfigs().catch(() => {
      setErrorMessage("无法连接后端服务，模型配置需要后端加密保存。");
    });
  }, [fetchModelConfigs]);

  const selected = useMemo(() => modelConfigs.find((model) => model.id === selectedId), [modelConfigs, selectedId]);

  useEffect(() => {
    if (!creating && !selectedId && modelConfigs[0]) setSelectedId(modelConfigs[0].id);
  }, [creating, modelConfigs, selectedId]);

  async function submitModel(data: Partial<ModelConfig> & { apiKey?: string }) {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      if (creating) await createModelConfig(data);
      else if (selected) await updateModelConfig(selected.id, data);
      setCreating(false);
      setSuccessMessage("模型已保存。");
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1180px] gap-5">
      <ModelConfigList
        models={modelConfigs}
        selectedId={creating ? undefined : selected?.id}
        onSelect={(model) => {
          setCreating(false);
          setSelectedId(model.id);
          setErrorMessage("");
          setSuccessMessage("");
        }}
        onCreate={() => {
          setCreating(true);
          setSelectedId(undefined);
          setErrorMessage("");
          setSuccessMessage("");
        }}
      />
      <ModelConfigDetail
        model={selected}
        creating={creating}
        saving={saving}
        errorMessage={errorMessage}
        successMessage={successMessage}
        onCancel={() => {
          setCreating(false);
          setErrorMessage("");
          setSuccessMessage("");
          if (!selectedId && modelConfigs[0]) setSelectedId(modelConfigs[0].id);
        }}
        onDelete={selected ? async () => {
          setErrorMessage("");
          setSuccessMessage("");
          try {
            await deleteModelConfig(selected.id);
            setSelectedId(undefined);
            setSuccessMessage("模型已删除。");
          } catch (error) {
            setErrorMessage(errorText(error));
          }
        } : undefined}
        onTest={selected ? async () => {
          try {
            return await testModelConfig(selected.id);
          } catch (error) {
            const message = errorText(error);
            setErrorMessage(message);
            return message;
          }
        } : undefined}
        onSubmit={submitModel}
      />
    </div>
  );
}
