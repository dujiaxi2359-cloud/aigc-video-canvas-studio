import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Edit3, FileText, Folder, FolderPlus, Image, Link2, Music, Search, Trash2, Upload, Video } from "lucide-react";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { assetApi } from "../services/assetApi";
import { useAssetStore } from "../store/assetStore";
import type { Asset, AssetType } from "../types/asset";
import { absoluteUploadUrl } from "../utils/file";
import { formatTime } from "../utils/time";
import { AssetFolderTree } from "../components/assets/AssetFolderTree";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useI18nStore } from "../i18n";
import type { Page } from "../App";

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

export function AssetLibraryPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const { assets, folders, fetchAssets, fetchFolders, uploadAsset, deleteAsset, renameAsset, moveAsset, createFolder, renameFolder, deleteFolder } = useAssetStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState("all");
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [status, setStatus] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const t = useI18nStore((state) => state.t);

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
    setSelectedIds(new Set());
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

  async function refreshCurrentAssets() {
    await fetchAssets(query);
  }

  async function moveToFolder(assetId: string, nextFolderId: string | null) {
    await run("素材已移动", async () => {
      await moveAsset(assetId, nextFolderId);
      await refreshCurrentAssets();
    });
  }

  function createChildFolder(parentId: string) {
    const name = window.prompt("二级分类名称");
    if (name?.trim()) void run("二级分类已创建", () => createFolder(name.trim(), parentId));
  }

  async function importFiles(files: File[], targetFolderId: string | null) {
    await run(`${files.length} 个素材已导入`, async () => {
      for (const file of files) await uploadAsset(file, { folderId: targetFolderId });
      await fetchFolders();
      await refreshCurrentAssets();
    });
  }

  async function removeFolder(id: string) {
    await run("文件夹已删除", async () => {
      await deleteFolder(id);
      if (folderId === id) setFolderId(undefined);
      await fetchFolders();
    });
  }

  function toggleSelected(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(assetId) ? next.delete(assetId) : next.add(assetId);
      return next;
    });
  }

  async function deleteSelectedAssets() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.size} 个素材吗？此操作会从素材库移除。`)) return;
    const ids = Array.from(selectedIds);
    await run(`已删除 ${ids.length} 个素材`, async () => {
      await Promise.all(ids.map((id) => assetApi.remove(id)));
      setSelectedIds(new Set());
      await refreshCurrentAssets();
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
    ["all", t("assets.all")],
    ["image", "图片"],
    ["video", "视频"],
    ["audio", "音频"],
    ["text", "文本"],
    ["script", "脚本"],
    ["generated", "生成结果"],
    ["uploaded", t("assets.uploaded")]
  ];

  return (
    <div className="asset-library-page h-full overflow-hidden bg-[#0b0b0c] px-5 pb-5 pt-[88px]">
      <HomeTopNav page="assets" onNavigate={onNavigate} />
      <div className="mx-auto grid h-full max-w-[1480px] grid-cols-[250px_1fr] gap-3">
        <aside className="overflow-auto rounded-[10px] border border-white/[0.1] bg-[#151516] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-white">{t("assets.title")}</div>
              <div className="text-[12px] text-white/38">{t("assets.subtitle")}</div>
            </div>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-2.5 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white"
              title="新建一级文件夹"
              onClick={() => {
                const name = window.prompt("文件夹名称");
                if (name?.trim()) run("文件夹已创建", () => createFolder(name.trim(), null));
              }}
            >
              <FolderPlus size={15} />
              <span>新建文件夹</span>
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
                className={`flex h-9 w-full items-center justify-between rounded-[7px] px-3 text-left text-[13px] transition ${activeView === value && folderId === undefined ? "bg-white/[0.12] text-white" : "text-white/58 hover:bg-white/[0.06] hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/30">文件夹 · 拖入素材即可归类</div>
            {folders.length === 0 ? <div className="px-3 py-2 text-[12px] text-white/32">暂无文件夹</div> : null}
            <AssetFolderTree
              folders={folders}
              activeFolderId={folderId}
              onSelect={(nextFolderId) => { setFolderId(nextFolderId); setActiveView("all"); }}
              onCreateChild={createChildFolder}
              onRename={(folder) => { const name = window.prompt("重命名文件夹", folder.name); if (name?.trim()) void run("文件夹已重命名", () => renameFolder(folder.id, name.trim())); }}
              onDelete={(folder) => { if (window.confirm(`确定删除空文件夹“${folder.name}”吗？`)) void removeFolder(folder.id); }}
              onDropAsset={moveToFolder}
              onImportFiles={importFiles}
            />
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-white/[0.1] bg-[#121213]">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={15} />
              <Input className="pl-9" placeholder={t("assets.search")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </div>
            <div className="w-36 shrink-0">
              <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="createdAt">按时间</option>
                <option value="name">按名称</option>
                <option value="type">按类型</option>
                <option value="size">按大小</option>
              </Select>
            </div>
            <div className="w-28 shrink-0">
              <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="desc">倒序</option>
                <option value="asc">正序</option>
              </Select>
            </div>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> {t("assets.upload")}</Button>
            {assets.length > 0 && (
              <>
                <button type="button" className="h-9 rounded-[8px] border border-white/[0.1] px-3 text-[12px] text-white/65 hover:bg-white/[0.06] hover:text-white" onClick={() => setSelectedIds(selectedIds.size === assets.length ? new Set() : new Set(assets.map((asset) => asset.id)))}>
                  {selectedIds.size === assets.length ? "取消全选" : "全选"}
                </button>
                {selectedIds.size > 0 && (
                  <button type="button" className="flex h-9 items-center gap-1.5 rounded-[8px] bg-red-400/[0.12] px-3 text-[12px] text-red-100 hover:bg-red-400/[0.2]" onClick={() => void deleteSelectedAssets()}>
                    <Trash2 size={14} /> 删除已选（{selectedIds.size}）
                  </button>
                )}
              </>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </div>

          {status ? <div className="mx-4 mt-3 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100">{status}</div> : null}

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {assets.length === 0 ? (
              <Card>
                <div className="py-12 text-center">
                  <div className="text-[15px] font-semibold text-white">{t("assets.emptyTitle")}</div>
                  <div className="mt-2 text-[13px] text-white/42">{t("assets.emptyDesc")}</div>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>{t("assets.upload")}</Button>
                    <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "canvas" }))}>{t("assets.backCanvas")}</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {assets.map((asset) => {
                  const Icon = typeIcon(asset.type);
                  return (
                    <Card key={asset.id} className={selectedIds.has(asset.id) ? "ring-1 ring-cyan-300/60" : ""}>
                      <div
                        className="relative"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/aigc-asset", dragPayload(asset));
                          event.dataTransfer.setData("text/plain", asset.id);
                          event.dataTransfer.effectAllowed = "copyMove";
                        }}
                      >
                        <button
                          type="button"
                          title={selectedIds.has(asset.id) ? t("assets.unselect") : t("assets.select")}
                          className={`absolute left-0 top-0 z-10 grid h-7 w-7 place-items-center rounded-[7px] border ${selectedIds.has(asset.id) ? "border-cyan-200/60 bg-cyan-300 text-black" : "border-white/[0.16] bg-black/60 text-transparent hover:text-white/65"}`}
                          onClick={(event) => { event.stopPropagation(); toggleSelected(asset.id); }}
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 pl-9">
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
                          {asset.type === "image" ? <img src={absoluteUploadUrl(asset.thumbnailUrl || asset.previewUrl || asset.url)} className="h-40 w-full object-cover" loading="lazy" decoding="async" /> : null}
                          {asset.type === "video" ? (
                            <div className="relative grid h-40 place-items-center bg-black/35 text-white/40">
                              {asset.posterUrl || asset.thumbnailUrl ? <img src={absoluteUploadUrl(asset.posterUrl || asset.thumbnailUrl)} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
                              <span className="relative rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[12px] text-white/72">点击下载或拖入画布后播放</span>
                            </div>
                          ) : null}
                          {asset.type === "audio" ? <div className="p-3"><audio src={absoluteUploadUrl(asset.url)} controls className="w-full" /></div> : null}
                          {!["image", "video", "audio"].includes(asset.type) ? <div className="grid h-40 place-items-center text-white/34"><FileText size={30} /></div> : null}
                        </div>

                        <div className="mt-3 text-[12px] leading-5 text-white/44">
                          <div>{formatTime(asset.createdAt)}</div>
                          {(asset.width || asset.height) ? <div>{asset.width} x {asset.height}{asset.duration ? ` / ${asset.duration.toFixed(1)}s` : ""}</div> : null}
                        </div>

                        <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.07] pt-3">
                          <button title="下载" type="button" onClick={() => downloadAsset(asset)} className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white/52 hover:bg-white/[0.1] hover:text-white"><Download size={13} /></button>
                          <button title={t("assets.rename")} type="button" onClick={() => { const name = window.prompt("素材名称", asset.name); if (name) run("素材已重命名", () => renameAsset(asset.id, name)); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white/52 hover:bg-white/[0.1] hover:text-white"><Edit3 size={13} /></button>
                          <button title="复制路径" type="button" onClick={() => navigator.clipboard.writeText(asset.localPath || asset.url)} className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white/52 hover:bg-white/[0.1] hover:text-white"><Copy size={13} /></button>
                          <button title="复制 URL" type="button" onClick={() => navigator.clipboard.writeText(asset.publicUrl || absoluteUploadUrl(asset.url))} className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white/52 hover:bg-white/[0.1] hover:text-white"><Link2 size={13} /></button>
                          <Select className="min-w-0 flex-1" value={asset.folderId ?? ""} onChange={(event) => void moveToFolder(asset.id, event.target.value || null)}>
                            <option value="">根目录</option>
                            {folders.map((folder) => {
                              const parent = folder.parentId ? folders.find((item) => item.id === folder.parentId) : null;
                              return <option key={folder.id} value={folder.id}>{parent ? `${parent.name} / ${folder.name}` : folder.name}</option>;
                            })}
                          </Select>
                          <button title={t("assets.delete")} type="button" onClick={() => { if (window.confirm("确定删除该素材吗？此操作会从素材库移除。")) run("素材已删除", () => deleteAsset(asset.id)); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-red-400/[0.08] text-red-200/60 hover:bg-red-400/[0.14] hover:text-red-100"><Trash2 size={13} /></button>
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
