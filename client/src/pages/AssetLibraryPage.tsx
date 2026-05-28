import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit3, FileText, Folder, FolderPlus, Image, Music, Search, Trash2, Upload, Video } from "lucide-react";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { assetApi } from "../services/assetApi";
import { useAssetStore } from "../store/assetStore";
import type { Asset, AssetType } from "../types/asset";
import { absoluteUploadUrl } from "../utils/file";
import { formatTime } from "../utils/time";

const assetTypeLabels: Record<string, string> = {
  all: "全部素材",
  image: "图片",
  video: "视频",
  audio: "音频",
  text: "文本",
  script: "脚本",
  generated: "生成结果",
  uploaded: "上传素材",
  uncategorized: "未分类"
};

function typeIcon(type: AssetType) {
  if (type === "image") return Image;
  if (type === "video") return Video;
  if (type === "audio") return Music;
  return FileText;
}

function formatSize(size?: number) {
  if (!size) return "-";
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function downloadAsset(asset: Asset) {
  window.location.href = assetApi.downloadUrl(asset.id);
}

export function AssetLibraryPage() {
  const { assets, folders, fetchAssets, fetchFolders, uploadAsset, deleteAsset, renameAsset, moveAsset, createFolder, renameFolder, deleteFolder } = useAssetStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState("all");
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [status, setStatus] = useState("");

  const query = useMemo(() => {
    const next: Record<string, string | null | undefined> = { keyword, sortBy, sortOrder };
    if (activeView === "generated") next.source = "generated";
    else if (activeView === "uploaded") next.source = "uploaded";
    else if (activeView === "uncategorized") next.folderId = "root";
    else if (activeView !== "all") next.type = activeView;
    if (folderId !== undefined) next.folderId = folderId ?? "root";
    return next;
  }, [activeView, folderId, keyword, sortBy, sortOrder]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchAssets(query);
  }, [fetchAssets, query]);

  async function run(label: string, action: () => Promise<void>) {
    try {
      setStatus("");
      await action();
      setStatus(label);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    await run("上传完成", async () => {
      await uploadAsset(file, { folderId: folderId ?? null });
    });
  }

  function dragPayload(asset: Asset) {
    return JSON.stringify({
      assetId: asset.id,
      type: asset.type,
      filePath: asset.localPath,
      url: asset.url,
      publicUrl: asset.publicUrl,
      thumbnailUrl: asset.thumbnailUrl
    });
  }

  const sidebarItems = [
    ["all", "全部素材"],
    ["image", "图片"],
    ["video", "视频"],
    ["audio", "音频"],
    ["text", "文本"],
    ["script", "脚本"],
    ["generated", "生成结果"],
    ["uploaded", "上传素材"],
    ["uncategorized", "未分类"]
  ];

  return (
    <div className="h-full overflow-hidden bg-[linear-gradient(180deg,#0a0b0f_0%,#090a0d_100%)] p-5">
      <div className="mx-auto grid h-full max-w-[1320px] grid-cols-[240px_1fr] gap-4">
        <aside className="overflow-auto rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-white">素材库</div>
              <div className="text-[12px] text-white/38">项目素材文件夹</div>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 hover:text-white"
              onClick={() => {
                const name = window.prompt("文件夹名称");
                if (name) run("文件夹已创建", () => createFolder(name, folderId ?? null));
              }}
            >
              <FolderPlus size={15} />
            </button>
          </div>
          <div className="space-y-1">
            {sidebarItems.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setActiveView(value);
                  setFolderId(undefined);
                }}
                className={`flex h-9 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] transition ${activeView === value && folderId === undefined ? "bg-indigo-500/18 text-white" : "text-white/58 hover:bg-white/[0.05] hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/30">文件夹</div>
            {folders.length === 0 ? <div className="px-3 py-2 text-[12px] text-white/32">暂无文件夹</div> : null}
            {folders.map((folder) => (
              <div key={folder.id} className={`group flex items-center gap-2 rounded-xl px-3 py-2 ${folderId === folder.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-white/68" onClick={() => { setFolderId(folder.id); setActiveView("all"); }}>
                  <Folder size={14} /> <span className="truncate">{folder.name}</span>
                </button>
                <button type="button" className="hidden text-white/40 hover:text-white group-hover:block" onClick={() => { const name = window.prompt("重命名文件夹", folder.name); if (name) run("文件夹已重命名", () => renameFolder(folder.id, name)); }}><Edit3 size={13} /></button>
                <button type="button" className="hidden text-red-200/60 hover:text-red-100 group-hover:block" onClick={() => { if (window.confirm("确定删除该空文件夹吗？")) run("文件夹已删除", () => deleteFolder(folder.id)); }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={15} />
              <Input className="pl-9" placeholder="搜索素材名称、原文件名或提示词" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </div>
            <Select className="w-36" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="createdAt">按时间</option>
              <option value="name">按名称</option>
              <option value="type">按类型</option>
              <option value="size">按大小</option>
            </Select>
            <Select className="w-28" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="desc">倒序</option>
              <option value="asc">正序</option>
            </Select>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> 上传素材</Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </div>

          {status ? <div className="mx-4 mt-3 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100">{status}</div> : null}

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {assets.length === 0 ? (
              <Card>
                <div className="py-12 text-center">
                  <div className="text-[15px] font-semibold text-white">还没有素材。</div>
                  <div className="mt-2 text-[13px] text-white/42">你可以上传图片 / 视频，或在画布中生成内容后自动入库。</div>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>上传素材</Button>
                    <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "canvas" }))}>返回画布生成</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => {
                  const Icon = typeIcon(asset.type);
                  return (
                    <Card key={asset.id}>
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/aigc-asset", dragPayload(asset));
                          event.dataTransfer.setData("text/plain", asset.id);
                        }}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold text-white">{asset.name}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-white/38">
                              <span>{assetTypeLabels[asset.type] ?? asset.type}</span>
                              <span>{asset.source === "generated" ? "生成" : "上传"}</span>
                              <span>{formatSize(asset.size)}</span>
                            </div>
                          </div>
                          <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.05] text-white/58"><Icon size={15} /></div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
                          {asset.type === "image" ? <img src={absoluteUploadUrl(asset.thumbnailUrl || asset.url)} className="h-40 w-full object-cover" /> : null}
                          {asset.type === "video" ? <video src={absoluteUploadUrl(asset.url)} className="h-40 w-full object-contain" controls /> : null}
                          {asset.type === "audio" ? <div className="p-3"><audio src={absoluteUploadUrl(asset.url)} controls className="w-full" /></div> : null}
                          {!["image", "video", "audio"].includes(asset.type) ? <div className="grid h-40 place-items-center text-white/34"><FileText size={30} /></div> : null}
                        </div>

                        <div className="mt-3 text-[12px] leading-5 text-white/44">
                          <div>{formatTime(asset.createdAt)}</div>
                          {(asset.width || asset.height) ? <div>{asset.width} x {asset.height}{asset.duration ? ` / ${asset.duration.toFixed(1)}s` : ""}</div> : null}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <Button variant="secondary" onClick={() => downloadAsset(asset)}><Download size={13} /> 下载</Button>
                          <Button variant="secondary" onClick={() => { const name = window.prompt("素材名称", asset.name); if (name) run("素材已重命名", () => renameAsset(asset.id, name)); }}>重命名</Button>
                          <Select value={asset.folderId ?? ""} onChange={(event) => run("素材已移动", () => moveAsset(asset.id, event.target.value || null))}>
                            <option value="">根目录</option>
                            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                          </Select>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(asset.localPath || asset.url)}>复制路径</Button>
                          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(asset.publicUrl || absoluteUploadUrl(asset.url))}>复制 URL</Button>
                          <Button variant="danger" onClick={() => { if (window.confirm("确定删除该素材吗？此操作会从素材库移除。")) run("素材已删除", () => deleteAsset(asset.id)); }}>删除</Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
