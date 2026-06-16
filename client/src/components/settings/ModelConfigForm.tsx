import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { ApiKeyInput } from "./ApiKeyInput";
import { defaultCapabilities } from "./defaults";
import type { ModelConfig } from "../../types/model";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <div className="text-[12px] font-medium text-[#94a3b8]">{label}</div>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.92] p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-[#f3f5f7]">{title}</h3>
      {children}
    </section>
  );
}

export function ModelConfigForm({
  model,
  onSubmit,
  onCancel,
  onTest,
  saving = false
}: {
  model?: ModelConfig;
  onSubmit: (data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  onCancel: () => void;
  onTest?: (data: Partial<ModelConfig> & { apiKey?: string }) => Promise<string>;
  saving?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    providerId: model?.providerId ?? "",
    provider: model?.provider ?? "",
    category: model?.category ?? "video",
    displayName: model?.displayName ?? "",
    apiBaseUrl: model?.apiBaseUrl || "",
    requiresApiBaseUrl: model?.requiresApiBaseUrl ?? false,
    apiKey: "",
    modelName: model?.modelName ?? "",
    modelType: model?.modelType ?? "text-to-video",
    enabled: model?.enabled ?? true,
    capabilities: model?.capabilities ?? defaultCapabilities()
  });

  const isAzureOpenAI = form.providerId === "azure-openai";

  useEffect(() => {
    if (!model) {
      setForm({
        providerId: "",
        provider: "",
        category: "video",
        displayName: "",
        apiBaseUrl: "",
        requiresApiBaseUrl: false,
        apiKey: "",
        modelName: "",
        modelType: "text-to-video",
        enabled: true,
        capabilities: defaultCapabilities()
      });
      setMessage("");
      return;
    }

    setForm({
      providerId: model.providerId ?? "",
      provider: model.provider,
      category: model.category ?? "video",
      displayName: model.displayName,
      apiBaseUrl: model.apiBaseUrl || "",
      requiresApiBaseUrl: model.requiresApiBaseUrl ?? false,
      apiKey: "",
      modelName: model.modelName,
      modelType: model.modelType,
      enabled: model.enabled,
      capabilities: model.capabilities
    });
    setMessage("");
  }, [model, model?.id]);

  async function submit() {
    const payload: Partial<ModelConfig> & { apiKey?: string } = {
      providerId: form.providerId,
      provider: form.provider,
      category: form.category,
      displayName: form.displayName,
      apiBaseUrl: form.apiBaseUrl,
      requiresApiBaseUrl: form.requiresApiBaseUrl,
      modelName: form.modelName,
      modelType: form.modelType,
      enabled: form.enabled,
      capabilities: form.capabilities
    };
    if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
    await onSubmit(payload);
  }

  return (
    <div className="space-y-4">
      <Section title="基础信息">
        <div className="grid grid-cols-2 gap-3">
          <Field label="服务商">
            <Input value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} />
          </Field>
          <Field label="显示名称">
            <Input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
          </Field>
          <Field label={isAzureOpenAI ? "Deployment Name / 部署名" : "模型名称"}>
            <Input value={form.modelName} onChange={(event) => setForm((current) => ({ ...current, modelName: event.target.value }))} />
            {isAzureOpenAI && <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">这里填写 Azure AI Foundry / Azure OpenAI 中创建的部署名称。</div>}
          </Field>
          <Field label="模型类型">
            <Input value={form.modelType} readOnly />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-[#cfd6e1]">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
          启用该模型
        </label>
      </Section>

      <Section title="API 连接">
        <div className="space-y-3">
          <Field label="API Base URL">
            <Input
              value={form.apiBaseUrl}
              placeholder={isAzureOpenAI ? "https://你的资源名.openai.azure.com" : "默认使用官方地址，也可以填写自定义中转地址"}
              onChange={(event) => setForm((current) => ({ ...current, apiBaseUrl: event.target.value }))}
            />
            {isAzureOpenAI && <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">可填写资源根地址，例如 https://你的资源名.openai.azure.com；也支持粘贴完整 images/generations endpoint。</div>}
          </Field>
          <Field label="API Key">
            <ApiKeyInput value={form.apiKey} maskedValue={model?.maskedApiKey} onChange={(apiKey) => setForm((current) => ({ ...current, apiKey }))} onTest={async () => setMessage(onTest ? await onTest(form) : "请先保存后再测试连接")} />
            {form.providerId === "kling" && <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">可灵官方开放平台填写 AccessKey:SecretKey；使用中转时直接填写中转提供的 Bearer Token。</div>}
          </Field>
          {message && <div className="text-[12px] text-[#7d8796]">{message}</div>}
        </div>
      </Section>

      <div className="rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.72] p-4 text-[12px] leading-5 text-[#7d8796]">
        模型以你填写或上游拉取的模型 ID 为准。请求地址、API Key 和模型能力保存在后端，画布节点只读取已启用模型。
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "保存中..." : "保存模型"}</Button>
      </div>
    </div>
  );
}
