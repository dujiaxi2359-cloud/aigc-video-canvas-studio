import { useEffect, useMemo, useState } from "react";
import { Download, Image, Search, Trash2, Video } from "lucide-react";
import { downloadAsset } from "../services/downloadApi";
import { useHistoryStore } from "../store/historyStore";
import type { GenerationHistory } from "../types/history";
import { absoluteUploadUrl } from "../utils/file";
import { formatTime } from "../utils/time";

type Filter = "all" | "image" | "video";

function historyKind(item: GenerationHistory) {
  if (item.generationType === "image" || item.generationType === "video") return item.generationType;
  const value = `${item.inputMode || ""} ${item.outputUrl || ""}`.toLowerCase();
  return /\.(png|jpe?g|webp)(\?|$)/.test(value) || value.includes("image") ? "image" : "video";
}

export function HistoryPage() {
  const { histories, fetchHistories, deleteHistory } = useHistoryStore();
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    void fetchHistories();
    const interval = window.setInterval(() => void fetchHistories(), 5000);
    return () => window.clearInterval(interval);
  }, [fetchHistories]);

  const visible = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return histories.filter((item) => {
      const kind = historyKind(item);
      return (filter === "all" || filter === kind) && (!term || `${item.modelDisplayName} ${item.prompt}`.toLowerCase().includes(term));
    });
  }, [filter, histories, keyword]);

  async function downloadHistory(item: GenerationHistory) {
    if (!item.outputUrl) return;
    const ext = /\.(png|jpe?g|webp|mp4|webm|mov|m4v)(\?|$)/i.exec(item.outputUrl)?.[1] ?? "bin";
    try {
      await downloadAsset(item.outputUrl, `aigc_history_${item.modelDisplayName || item.id}.${ext}`);
      setStatus("下载已开始");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "下载失败");
    }
  }

  return (
    <div className="h-full overflow-auto bg-[#0b0b0c] pb-10 pl-[82px] pr-8 pt-7 text-white">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08]">
          <div className="flex gap-7">
            {([["all", "全部历史"], ["image", "图片历史"], ["video", "视频历史"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`relative pb-3 text-[14px] ${filter === value ? "font-semibold text-white" : "text-white/36"}`}>
                {label}
                {filter === value ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white" /> : null}
              </button>
            ))}
          </div>
          <label className="relative mb-2 block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={15} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索模型或提示词" className="h-9 w-[240px] rounded-[8px] border border-white/[0.1] bg-white/[0.045] pl-9 pr-3 text-[12px] outline-none placeholder:text-white/28 focus:border-cyan-200/40" />
          </label>
        </div>

        {status ? <div className="mt-4 rounded-[8px] border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-[12px] text-white/66">{status}</div> : null}

        {visible.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center text-[13px] text-white/34">暂无生成记录</div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => {
              const kind = historyKind(item);
              const source = item.outputUrl ? absoluteUploadUrl(item.outputUrl) : "";
              return (
                <article key={item.id} className="group overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#19191a]">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#242426]">
                    {source && kind === "image" ? <img src={source} alt="" className="h-full w-full object-cover" /> : null}
                    {source && kind === "video" ? <video src={source} className="h-full w-full object-cover" muted playsInline /> : null}
                    {!source ? <div className="grid h-full place-items-center text-white/24">{kind === "image" ? <Image size={32} /> : <Video size={32} />}</div> : null}
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      {source ? <button title="下载" type="button" onClick={() => downloadHistory(item)} className="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white hover:bg-black"><Download size={14} /></button> : null}
                      <button title="删除" type="button" onClick={() => deleteHistory(item.id)} className="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-red-200 hover:bg-black"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[13px] font-semibold">{item.modelDisplayName ?? "未选择模型"}</div>
                    <div className="mt-1 line-clamp-2 min-h-[34px] text-[11px] leading-[17px] text-white/42">{item.prompt || item.errorMessage || "无提示词记录"}</div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-white/30">
                      <span>{item.aspectRatio || "-"} · {item.resolution || "-"} · {item.duration ? `${item.duration}s` : "-"}</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
