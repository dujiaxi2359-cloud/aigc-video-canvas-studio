import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Select } from "../common/Select";
import { ApiKeyInput } from "./ApiKeyInput";
import { modelConfigApi } from "../../services/modelConfigApi";
import { fallbackModelCatalog } from "../../data/modelCatalog";
import { providerCatalog } from "../../data/providerCatalog";
import { defaultCapabilities } from "./defaults";
import type { ModelCatalogItem, ModelConfig } from "../../types/model";

type CategoryFilter = "all" | "text" | "image" | "video";
type ProviderFilter = "all" | "deepseek" | "openai" | "azure-openai" | "alibaba" | "google" | "kling" | "grok" | "seedance";

const categoryTabs: Array<[CategoryFilter, string]> = [
  ["all", "全部"],
  ["text", "文字模型"],
  ["image", "图片模型"],
  ["video", "视频模型"]
];

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

function describeModel(model: ModelCatalogItem) {
  if (model.category === "image") return "图片生成 / 图片编辑";
  if (model.category === "video") return "视频生成";
  if (model.category === "text") return "文本生成";
  return model.modelType;
}

function categoryOf(model?: ModelCatalogItem | ModelConfig): CategoryFilter {
  if (model?.category === "text" || model?.category === "image" || model?.category === "video") return model.category;
  return "video";
}

function defaultApiBaseUrlFor(model: ModelConfig | undefined, catalog: ModelCatalogItem[]) {
  if (!model) return "";
  const catalogItem = catalog.find((item) => item.providerId === model.providerId && item.name === model.modelName) ?? fallbackModelCatalog.find((item) => item.providerId === model.providerId && item.name === model.modelName);
  return catalogItem?.defaultApiBaseUrl ?? providerCatalog.find((provider) => provider.id === model.providerId)?.defaultApiBaseUrl ?? "";
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
  onTest?: () => Promise<string>;
  saving?: boolean;
}) {
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(categoryOf(model));
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>((model?.providerId as ProviderFilter | undefined) ?? "all");
  const [catalogId, setCatalogId] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    providerId: model?.providerId ?? "",
    provider: model?.provider ?? "",
    category: model?.category ?? "video",
    displayName: model?.displayName ?? "",
    apiBaseUrl: model?.apiBaseUrl || defaultApiBaseUrlFor(model, fallbackModelCatalog),
    requiresApiBaseUrl: model?.requiresApiBaseUrl ?? false,
    apiKey: "",
    modelName: model?.modelName ?? "",
    modelType: model?.modelType ?? "text-to-video",
    enabled: model?.enabled ?? true,
    capabilities: model?.capabilities ?? defaultCapabilities()
  });

  const isAzureOpenAI = form.providerId === "azure-openai";

  useEffect(() => {
    modelConfigApi.catalog().then((items) => setCatalog(items.length ? items : fallbackModelCatalog)).catch(() => setCatalog(fallbackModelCatalog));
  }, []);

  useEffect(() => {
    if (!model) {
      setCatalogId("");
      setCategoryFilter("video");
      setProviderFilter("all");
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

    const matchedCatalogItem = catalog.find((item) => item.providerId === model.providerId && item.name === model.modelName) ?? fallbackModelCatalog.find((item) => item.providerId === model.providerId && item.name === model.modelName);
    const fallbackApiBaseUrl = matchedCatalogItem?.defaultApiBaseUrl ?? providerCatalog.find((provider) => provider.id === model.providerId)?.defaultApiBaseUrl ?? "";
    setCatalogId(matchedCatalogItem?.id ?? "");
    setCategoryFilter(categoryOf(model));
    setProviderFilter((model.providerId as ProviderFilter | undefined) ?? "all");
    setForm({
      providerId: model.providerId ?? "",
      provider: model.provider,
      category: model.category ?? "video",
      displayName: model.displayName,
      apiBaseUrl: model.apiBaseUrl || fallbackApiBaseUrl,
      requiresApiBaseUrl: model.requiresApiBaseUrl ?? false,
      apiKey: "",
      modelName: model.modelName,
      modelType: model.modelType,
      enabled: model.enabled,
      capabilities: model.capabilities
    });
    setMessage("");
  }, [catalog, model, model?.id]);

  const availableProviders = useMemo(() => providerCatalog.filter((provider) => categoryFilter === "all" || provider.categories.includes(categoryFilter)), [categoryFilter]);

  useEffect(() => {
    if (providerFilter !== "all" && !availableProviders.some((provider) => provider.id === providerFilter)) setProviderFilter("all");
  }, [availableProviders, providerFilter]);

  const filteredCatalog = useMemo(
    () => catalog.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (providerFilter !== "all" && item.providerId !== providerFilter) return false;
      return true;
    }),
    [catalog, categoryFilter, providerFilter]
  );

  const catalogGroups = useMemo(() => {
    return filteredCatalog.reduce<Record<string, ModelCatalogItem[]>>((groups, item) => {
      groups[item.provider] = groups[item.provider] ?? [];
      groups[item.provider].push(item);
      return groups;
    }, {});
  }, [filteredCatalog]);

  function applyCatalog(item?: ModelCatalogItem) {
    if (!item) return;
    setCatalogId(item.id);
    setCategoryFilter(categoryOf(item));
    setProviderFilter((item.providerId as ProviderFilter | undefined) ?? "all");
    setForm((current) => ({
      ...current,
      providerId: item.providerId ?? "",
      provider: item.provider,
      category: item.category,
      displayName: item.displayName,
      apiBaseUrl: item.defaultApiBaseUrl,
      requiresApiBaseUrl: item.requiresApiBaseUrl,
      modelName: item.name,
      modelType: item.modelType,
      capabilities: item.capabilities
    }));
  }

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
      {!model && (
        <Section title="选择内置模型">
          <div className="mb-3 flex flex-wrap gap-2">
            {categoryTabs.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setCategoryFilter(value)} className={`h-8 rounded-full border px-3 text-[12px] font-medium transition ${categoryFilter === value ? "border-[#7c6cf6]/40 bg-[#7c6cf6]/15 text-white" : "border-white/[0.08] text-[#a2acba] hover:bg-white/[0.05]"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setProviderFilter("all")} className={`h-8 rounded-full border px-3 text-[12px] ${providerFilter === "all" ? "border-[#7c6cf6]/40 bg-[#7c6cf6]/15 text-white" : "border-white/[0.08] text-[#a2acba]"}`}>
              全部服务商
            </button>
            {availableProviders.map((provider) => (
              <button key={provider.id} type="button" onClick={() => setProviderFilter(provider.id as ProviderFilter)} className={`h-8 rounded-full border px-3 text-[12px] ${providerFilter === provider.id ? "border-[#7c6cf6]/40 bg-[#7c6cf6]/15 text-white" : "border-white/[0.08] text-[#a2acba]"}`}>
                {provider.displayName}
              </button>
            ))}
          </div>
          <Select value={catalogId} onChange={(event) => applyCatalog(catalog.find((item) => item.id === event.target.value))}>
            <option value="">选择模型</option>
            {Object.entries(catalogGroups).map(([provider, items]) => (
              <optgroup key={provider} label={provider}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.displayName} · {describeModel(item)}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Section>
      )}

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
              placeholder={isAzureOpenAI ? "https://你的资源名.openai.azure.com" : form.requiresApiBaseUrl ? "请输入该服务商的 API Base URL" : undefined}
              onChange={(event) => setForm((current) => ({ ...current, apiBaseUrl: event.target.value }))}
              readOnly={!form.requiresApiBaseUrl}
            />
            {isAzureOpenAI && <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">可填写资源根地址，例如 https://你的资源名.openai.azure.com；也支持粘贴完整 images/generations endpoint。</div>}
          </Field>
          <Field label="API Key">
            <ApiKeyInput value={form.apiKey} maskedValue={model?.maskedApiKey} onChange={(apiKey) => setForm((current) => ({ ...current, apiKey }))} onTest={async () => setMessage(onTest ? await onTest() : "请先保存后再测试连接")} />
          </Field>
          {message && <div className="text-[12px] text-[#7d8796]">{message}</div>}
        </div>
      </Section>

      <div className="rounded-2xl border border-white/[0.08] bg-[#13171f]/[0.72] p-4 text-[12px] leading-5 text-[#7d8796]">
        模型能力由系统内置 modelCatalog 决定。用户只需要选择模型并填写自己的 API Key，画布节点不会出现 API Key 或 API Base URL。
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "保存中..." : "保存模型"}</Button>
      </div>
    </div>
  );
}
