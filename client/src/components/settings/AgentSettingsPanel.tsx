import { useState } from "react";
import { Bot, CheckCircle2, Loader2 } from "lucide-react";
import { agentApi } from "../../services/agentApi";
import { useAgentStore } from "../../store/agentStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useAvailableTextModels } from "../../store/modelConfigStore";

const featureSwitches = ["启用画布诊断", "启用自动创建节点", "启用错误解释", "启用提示词优化", "启用工作流规划"];

export function AgentSettingsPanel() {
  const textModels = useAvailableTextModels();
  const selectedModelConfigId = useAgentStore((state) => state.selectedModelConfigId);
  const setSelectedModelConfigId = useAgentStore((state) => state.setSelectedModelConfigId);
  const mode = useAgentStore((state) => state.mode);
  const setMode = useAgentStore((state) => state.setMode);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  async function testAgent() {
    setTesting(true);
    setMessage("");
    try {
      const result = await agentApi.plan({
        prompt: "测试 Agent，生成一个图生视频工作流计划",
        canvasState: useCanvasStore.getState().getCanvasState(),
        mode: "manual_confirm",
        modelConfigId: selectedModelConfigId
      });
      if (result.status !== "success") throw new Error(result.errorMessage ?? "Agent 测试失败");
      setMessage(`${result.provider === "rule-based" ? "本地规则引擎" : "Gemini Agent"} 连接成功，已返回 workflowPlan JSON。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent 测试失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="settings-section mb-5 p-5 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="settings-section-icon">
            <Bot size={18} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold text-white">Agent 智能体</h2>
            <p className="mt-1 text-[12px] text-white/42">选择推理模型和执行策略；密钥仍由 API 接入统一管理。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={testAgent}
          disabled={testing}
          className="settings-primary-button"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          测试 Agent
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-2">
          <label className="text-[12px] text-white/45">默认 Agent 模型</label>
          <select
            value={selectedModelConfigId ?? ""}
            onChange={(event) => setSelectedModelConfigId(event.target.value || undefined)}
            className="settings-select"
          >
            <option value="">自动选择 Gemini / DeepSeek / 本地规则引擎</option>
            {textModels.map((model) => (
              <option key={model.id} value={model.id}>{model.displayName}</option>
            ))}
          </select>
          {textModels.length === 0 && (
            <p className="text-[12px] leading-5 text-amber-100/65">请先配置 Gemini 或 DeepSeek 文本模型。当前将使用本地规则引擎生成基础工作流。</p>
          )}
        </div>

        <div className="grid gap-2">
          <label className="text-[12px] text-white/45">Agent 执行模式</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("manual_confirm")} className={`settings-segment ${mode === "manual_confirm" ? "is-active" : ""}`}>
              手动确认
            </button>
            <button type="button" onClick={() => setMode("auto")} className={`settings-segment ${mode === "auto" ? "is-active" : ""}`}>
              自动执行 Beta
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {featureSwitches.map((item) => (
          <label key={item} className="settings-check-option">
            <input type="checkbox" defaultChecked className="accent-indigo-500" />
            {item}
          </label>
        ))}
      </div>

      {message && <p className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[12px] text-white/60">{message}</p>}
    </section>
  );
}
