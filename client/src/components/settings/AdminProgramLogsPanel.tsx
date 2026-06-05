import { useEffect, useState } from "react";
import { FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { diagnosticsApi, type VeoDebugLogItem } from "../../services/diagnosticsApi";

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function DebugLogCard({ item }: { item: VeoDebugLogItem }) {
  const model = item.model ?? {};
  const request = item.request ?? {};
  const parsed = item.parsed ?? {};
  const rawSummary = (parsed.rawSummary ?? {}) as Record<string, unknown>;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/[0.16] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
            <FileText size={14} /> {text(model.modelName)}
          </div>
          <div className="mt-1 text-[11px] text-white/38">{formatDate(item.createdAt)} · {item.reason ?? "debug"}</div>
        </div>
        <span className="shrink-0 rounded-full border border-indigo-300/20 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-100">
          {Math.ceil(item.size / 1024)} KB
        </span>
      </div>
      <div className="mt-3 grid gap-1.5 text-[12px] leading-5 text-white/55 md:grid-cols-2">
        <div>模式：{text(model.officialMode)}</div>
        <div>输入：{text(model.inputMode)}</div>
        <div>比例：{text(request.aspectRatio)}</div>
        <div>分辨率：{text(request.resolution)}</div>
        <div>时长：{text(request.duration)}s</div>
        <div>参考图数量：{text(request.imageAssetCount)}</div>
        <div>responseKeys：{text(rawSummary.responseKeys)}</div>
        <div>generatedVideos：{text(rawSummary.generatedVideosCount)}</div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] text-indigo-200/80">查看解析摘要和文件路径</summary>
        <pre className="mt-2 max-h-[220px] overflow-auto rounded-xl border border-white/[0.06] bg-[#080b11] p-3 text-[11px] leading-5 text-white/58">
{JSON.stringify({ filePath: item.filePath, parsed: item.parsed, request: item.request }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function AdminProgramLogsPanel() {
  const [items, setItems] = useState<VeoDebugLogItem[]>([]);
  const [debugDir, setDebugDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await diagnosticsApi.veoDebugLogs();
      setItems(result.items);
      setDebugDir(result.debugDir);
    } catch (err) {
      setItems([]);
      setDebugDir("");
      setError(err instanceof Error ? err.message : "程序日志仅允许本机管理员通过 localhost 查看。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="mb-5 rounded-2xl border border-white/[0.08] bg-[#151922]/[0.82] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#f3f5f7]">
            <ShieldCheck size={17} className="text-indigo-200" /> 管理员程序日志
          </div>
          <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">
            仅本机 localhost 可见，用于查看 Google Veo operation 调试快照。同事通过内网地址访问不会显示日志。
          </div>
          {debugDir && <div className="mt-1 break-all text-[11px] text-white/34">{debugDir}</div>}
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-[12px] text-white/70 transition hover:border-indigo-300/25 hover:text-white disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新日志
        </button>
      </div>
      {error ? (
        <div className="rounded-xl border border-amber-300/[0.16] bg-amber-400/[0.07] px-3 py-2 text-[12px] leading-5 text-amber-100/80">{error}</div>
      ) : items.length ? (
        <div className="grid gap-3">{items.map((item) => <DebugLogCard key={item.file} item={item} />)}</div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-black/[0.12] px-3 py-3 text-[12px] text-white/45">
          暂无 Veo 调试快照。下次 Veo 报错后会自动出现在这里。
        </div>
      )}
    </section>
  );
}
