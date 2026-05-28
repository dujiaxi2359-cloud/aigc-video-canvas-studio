import { useEffect, useState } from "react";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { downloadAsset } from "../services/downloadApi";
import { useHistoryStore } from "../store/historyStore";
import type { GenerationHistory } from "../types/history";
import { formatTime } from "../utils/time";

export function HistoryPage() {
  const { histories, fetchHistories, deleteHistory } = useHistoryStore();
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchHistories();
  }, [fetchHistories]);

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
    <div className="h-full overflow-auto bg-[linear-gradient(180deg,#0a0b0f_0%,#090a0d_100%)] p-6">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-[#f3f5f7]">生成历史</h2>
            <p className="mt-1 text-[13px] text-[#7d8796]">生成结果会自动进入素材库，这里保留最近生成记录。</p>
          </div>
          <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "assets" }))}>打开素材库</Button>
        </div>
        {status && <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white/70">{status}</div>}
        <div className="grid gap-3">
          {histories.length === 0 ? (
            <Card>
              <div className="py-8 text-center text-[13px] text-[#7d8796]">暂无生成记录。</div>
            </Card>
          ) : (
            histories.map((item) => (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[#f3f5f7]">
                      {item.modelDisplayName ?? "未选择模型"} / {item.status}
                    </div>
                    <div className="mt-1 text-[13px] text-[#7d8796]">
                      {item.inputMode ?? "未知模式"} / {item.duration ? `${item.duration}s` : "未设置时长"} / {item.aspectRatio ?? "未设置比例"} / {item.resolution ?? "未设置清晰度"}
                    </div>
                    {item.prompt && <div className="mt-2 max-w-3xl text-[13px] text-[#a2acba]">{item.prompt}</div>}
                    {item.outputUrl && <div className="mt-2 text-[12px] text-emerald-300">输出已保存，可下载或在素材库整理。</div>}
                    {item.errorMessage && <div className="mt-2 text-[12px] text-red-300">{item.errorMessage}</div>}
                    <div className="mt-2 text-[12px] text-[#7d8796]">{formatTime(item.createdAt)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {item.outputUrl && <Button variant="secondary" onClick={() => downloadHistory(item)}>下载</Button>}
                    <Button variant="danger" onClick={() => deleteHistory(item.id)}>删除</Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
