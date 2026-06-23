import { Bot, Check, ClipboardList, Loader2, Send, Sparkles, X } from "lucide-react";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAgentStore } from "../../store/agentStore";
import { useAvailableTextModels } from "../../store/modelConfigStore";

const quickPrompts = [
  "做一张电商主图",
  "做一个产品视频",
  "做一个图生视频",
  "做一组短剧分镜"
];

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    idle: "空闲",
    thinking: "分析中",
    waiting_confirm: "等待确认",
    running: "执行中",
    done: "完成",
    error: "失败"
  };
  return labels[status] ?? status;
}

export function AgentPanel() {
  const textModels = useAvailableTextModels();
  const {
    isAgentOpen,
    status,
    mode,
    currentPlan,
    diagnosticReport,
    messages,
    provider,
    errorMessage,
    draftPrompt,
    selectedModelConfigId,
    closeAgent,
    setMode,
    setDraftPrompt,
    setSelectedModelConfigId,
    submitPrompt,
    confirmPlan,
    cancelPlan,
    diagnoseCanvas
  } = useAgentStore();

  const disabled = status === "thinking" || status === "running";
  const lastMessages = useMemo(() => messages.slice(-4), [messages]);

  if (!isAgentOpen) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 28, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.98 }}
      className="nodrag nopan fixed right-5 top-[72px] z-[9998] flex max-h-[calc(100vh-96px)] w-[380px] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#10131a]/95 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
    >
      <header className="flex items-start justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-2xl border border-indigo-300/20 bg-indigo-500/15 text-indigo-100">
              <Bot size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">Moon｜Tv 创作助手</h2>
              <p className="text-[12px] text-white/40">你的工作流副驾驶</p>
            </div>
          </div>
        </div>
        <button type="button" onClick={closeAgent} className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/[0.06] hover:text-white">
          <X size={15} />
        </button>
      </header>

      <div className="space-y-4 overflow-auto px-5 py-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
          <span className="text-[12px] text-white/45">状态：{statusLabel(status)}</span>
          <span className="text-[12px] text-indigo-200/70">{provider ? `provider: ${provider}` : "fallback ready"}</span>
        </div>

        <div className="grid gap-2">
          <label className="text-[12px] text-white/45">默认创作模型</label>
          <select
            value={selectedModelConfigId ?? ""}
            onChange={(event) => setSelectedModelConfigId(event.target.value || undefined)}
            className="nodrag nopan nowheel h-9 rounded-xl border border-white/[0.08] bg-[#0b0e14] px-3 text-[13px] text-white/80 outline-none focus:border-indigo-400/50"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <option value="">自动选择 Gemini / DeepSeek / 规则引擎</option>
            {textModels.map((model) => (
              <option key={model.id} value={model.id}>{model.displayName}</option>
            ))}
          </select>
          {textModels.length === 0 && (
            <p className="rounded-xl border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-[12px] leading-5 text-amber-100/70">
              请先在设置中心配置 Gemini 或 DeepSeek 文本模型。当前将使用本地规则引擎生成基础工作流。
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("manual_confirm")} className={`h-9 rounded-xl border text-[12px] ${mode === "manual_confirm" ? "border-indigo-300/30 bg-indigo-500/15 text-white" : "border-white/[0.07] bg-white/[0.025] text-white/50"}`}>
            手动确认
          </button>
          <button type="button" onClick={() => setMode("auto")} className={`h-9 rounded-xl border text-[12px] ${mode === "auto" ? "border-indigo-300/30 bg-indigo-500/15 text-white" : "border-white/[0.07] bg-white/[0.025] text-white/50"}`}>
            自动执行 Beta
          </button>
        </div>

        <div className="grid gap-2">
          <textarea
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            placeholder="描述你想创作的内容，比如：做一个眼镜产品视频"
            className="nodrag nopan nowheel min-h-[92px] resize-none rounded-2xl border border-white/[0.08] bg-[#0b0e14] p-3 text-[13px] leading-6 text-white outline-none placeholder:text-white/25 focus:border-indigo-400/50"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => submitPrompt(draftPrompt)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-[13px] font-medium text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disabled ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            生成工作流计划
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {quickPrompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => submitPrompt(prompt)} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-[12px] text-white/55 hover:border-indigo-300/25 hover:text-white">
              {prompt}
            </button>
          ))}
          <button type="button" onClick={() => diagnoseCanvas()} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[12px] text-white/60 hover:border-indigo-300/25 hover:text-white">
            <ClipboardList size={14} />
            诊断当前画布
          </button>
        </div>

        {currentPlan && (
          <div className="rounded-2xl border border-indigo-300/18 bg-indigo-500/[0.08] p-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Sparkles size={15} />
              {currentPlan.title}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-white/55">{currentPlan.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {currentPlan.nodes.map((node) => (
                <span key={node.tempId} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[11px] text-white/55">{node.title}</span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={confirmPlan} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 text-[13px] font-medium text-white">
                <Check size={14} />
                确认创建
              </button>
              <button type="button" onClick={cancelPlan} className="h-9 rounded-xl border border-white/[0.08] px-4 text-[13px] text-white/55 hover:text-white">
                取消
              </button>
            </div>
          </div>
        )}

        {diagnosticReport && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <h3 className="text-[13px] font-semibold text-white">{diagnosticReport.summary}</h3>
            <div className="mt-3 space-y-2">
              {diagnosticReport.issues.map((issue, index) => (
                <div key={`${issue.title}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                  <p className="text-[12px] font-medium text-white/80">{issue.title}</p>
                  <p className="mt-1 text-[12px] leading-5 text-white/45">{issue.message}</p>
                  <p className="mt-1 text-[12px] leading-5 text-indigo-100/60">{issue.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {errorMessage && <p className="rounded-xl border border-red-300/15 bg-red-400/10 px-3 py-2 text-[12px] leading-5 text-red-100/80">{errorMessage}</p>}

        <div className="space-y-2">
          {lastMessages.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/25">{item.role}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-white/55">{item.content}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}
