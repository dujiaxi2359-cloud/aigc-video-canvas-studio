import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Blocks, Bot, ChevronDown, Clock3, Copy, Download, FileAudio, Folder, FolderPlus,
  Eye, History, Image as ImageIcon, LayoutTemplate, Link2, MessageCircle, MoreHorizontal, Plus, Search,
  ScrollText, Settings, Share2, Star, Trash2, Upload, UserRound, UsersRound, Video, X
} from "lucide-react";
import type { Page } from "../../App";
import { useI18nStore } from "../../i18n";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useHistoryStore } from "../../store/historyStore";
import { useProjectStore } from "../../store/projectStore";
import type { Asset } from "../../types/asset";
import type { GenerationHistory } from "../../types/history";
import type { WorkflowNodeType } from "../../types/node";
import { absoluteUploadUrl } from "../../utils/file";
import { MediaLightbox } from "../media/MediaLightbox";
import { AssetFolderTree } from "../assets/AssetFolderTree";
import { MoonLogo } from "../common/BrandIdentity";

export type DrawerName = "assets" | "templates" | "history" | null;

const toolbarItems: Array<{ id: Exclude<DrawerName, null> | "agent"; label: string; icon: ElementType }> = [
  { id: "assets", label: "assets.title", icon: Folder },
  { id: "templates", label: "Templates", icon: Blocks },
  { id: "agent", label: "Agent 对话", icon: MessageCircle },
  { id: "history", label: "历史记录", icon: History }
];

const templateItems = [
  { title: "Tech Product Ad", tone: "from-[#1c3d48] via-[#2e7379] to-[#9fc0b6]" },
  { title: "F1 Rapid Tire Swap", tone: "from-[#4e251f] via-[#9f4934] to-[#dfaf70]" },
  { title: "Japanese Eerie Horror", tone: "from-[#24212d] via-[#55445d] to-[#a18d9f]" },
  { title: "Monster Clash POV", tone: "from-[#26302d] via-[#526b54] to-[#a4a37a]" },
  { title: "Cave Monster Clash", tone: "from-[#292832] via-[#4d5169] to-[#8da3bd]" },
  { title: "英雄史诗电影赞歌", tone: "from-[#42322c] via-[#876552] to-[#c5a27b]" }
];

function assetDragPayload(asset: Asset) {
  return JSON.stringify({ assetId: asset.id, type: asset.type, filePath: asset.localPath, url: asset.url, publicUrl: asset.publicUrl, thumbnailUrl: asset.thumbnailUrl, width: asset.width, height: asset.height, duration: asset.duration });
}

function historyKind(item: GenerationHistory) {
  const value = `${item.inputMode || ""} ${item.outputUrl || ""}`.toLowerCase();
  return /\.(png|jpe?g|webp)(\?|$)/.test(value) || value.includes("image") ? "image" : "video";
}

export function CanvasTopBar({ onNavigate, onShare }: { onNavigate: (page: Page, projectId?: string) => void; onShare: () => void }) {
  const { currentProject, deleteProject } = useProjectStore();
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const t = useI18nStore((state) => state.t);

  async function removeCurrentProject() {
    if (!currentProject || !window.confirm(t("canvas.deleteConfirm", { name: currentProject.name || t("common.untitledProject") }))) return;
    await deleteProject(currentProject.id);
    clearCanvas();
    setProjectMenuOpen(false);
    onNavigate("workspace");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex h-[78px] items-start justify-between px-5 pt-4">
      <button type="button" onClick={() => onNavigate("home")} className="canvas-project-card pointer-events-auto text-left">
        <span className="canvas-project-mark">
          <MoonLogo className="canvas-project-logo" />
        </span>
        <span className="min-w-0">
          <span className="canvas-project-brand block">Moon｜Tv</span>
          <span className="canvas-project-title block max-w-[260px] truncate">{currentProject?.name || t("common.untitledProject")}</span>
          <span className="canvas-project-status mt-0.5 block">{t("common.justSaved")}</span>
        </span>
      </button>
      <div className="pointer-events-auto flex items-center gap-2">
        <button type="button" onClick={() => onNavigate("settings")} className="canvas-top-icon" title={t("canvas.settings")}><Settings size={16} /></button>
        <button type="button" onClick={onShare} className="canvas-top-icon" title="分享"><Share2 size={16} /></button>
        {currentProject && (
          <div className="relative">
            <button type="button" onClick={() => setProjectMenuOpen((value) => !value)} className="canvas-top-icon" title={t("canvas.projectActions")}><MoreHorizontal size={17} /></button>
            {projectMenuOpen && (
              <div className="workspace-context-menu right-0 top-12" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="is-danger" onClick={() => void removeCurrentProject()}><Trash2 size={14} /> {t("canvas.deleteProject")}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CanvasFloatingToolbar({
  drawer, addOpen, onAdd, onDrawer, onAgent
}: {
  drawer: DrawerName;
  addOpen: boolean;
  onAdd: () => void;
  onDrawer: (name: Exclude<DrawerName, null>) => void;
  onAgent: () => void;
}) {
  const t = useI18nStore((state) => state.t);
  return (
    <aside className="canvas-floating-toolbar">
      <button data-sidebar-add-button="true" type="button" title="添加节点" onClick={onAdd} className={`canvas-toolbar-main ${addOpen ? "is-active" : ""}`}><Plus size={21} /></button>
      {toolbarItems.map((item) => {
        const Icon = item.icon;
        const active = item.id !== "agent" && drawer === item.id;
        return <button key={item.id} type="button" title={item.label.includes(".") ? t(item.label) : item.label} onClick={() => item.id === "agent" ? onAgent() : onDrawer(item.id)} className={active ? "is-active" : ""}><Icon size={18} /></button>;
      })}
    </aside>
  );
}

function DrawerFrame({ title, children, onClose, actions }: { title: string; children: React.ReactNode; onClose: () => void; actions?: React.ReactNode }) {
  function closeDrawer(event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: -18, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -14, scale: 0.985 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="canvas-drawer"
    >
      <header className="flex h-14 items-center gap-2 border-b border-white/[0.07] px-3">
        <button type="button" aria-label="关闭抽屉" title="关闭抽屉" onPointerDown={closeDrawer} onClick={closeDrawer} className="drawer-icon"><ArrowLeft size={16} /></button>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </motion.aside>
  );
}

function AssetDrawer({ onClose }: { onClose: () => void }) {
  const { assets, folders, fetchAssets, fetchFolders, uploadAsset, createFolder, renameFolder, deleteFolder, moveAsset, deleteAsset } = useAssetStore();
  const addAssetNode = useCanvasStore((state) => state.addAssetNode);
  const t = useI18nStore((state) => state.t);
  const [team, setTeam] = useState<"personal" | "team">("personal");
  const [keyword, setKeyword] = useState("");
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<Asset | null>(null);

  useEffect(() => {
    fetchAssets(folderId === undefined ? {} : { folderId: folderId ?? "root" }).catch(() => undefined);
    fetchFolders().catch(() => undefined);
  }, [fetchAssets, fetchFolders, folderId]);

  const visibleAssets = useMemo(() => assets.filter((asset) => !keyword || asset.name.toLowerCase().includes(keyword.toLowerCase())), [assets, keyword]);
  async function addFolder(parentId: string | null = null) {
    const name = window.prompt("文件夹名称");
    if (name?.trim()) await createFolder(name.trim(), parentId);
  }

  async function moveToFolder(assetId: string, nextFolderId: string | null) {
    try {
      await moveAsset(assetId, nextFolderId);
      await fetchAssets(folderId === undefined ? {} : { folderId: folderId ?? "root" });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("canvas.moveAssetFailed"));
    }
  }

  async function importFiles(files: File[], targetFolderId: string | null) {
    try {
      for (const file of files) await uploadAsset(file, { folderId: targetFolderId });
      await fetchFolders();
      await fetchAssets(folderId === undefined ? {} : { folderId: folderId ?? "root" });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("canvas.importAssetFailed"));
    }
  }

  async function uploadFromPicker(file?: File) {
    if (!file) return;
    try {
      await uploadAsset(file, { folderId: folderId ?? null });
      await fetchAssets(folderId === undefined ? {} : { folderId: folderId ?? "root" });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("canvas.uploadAssetFailed"));
    }
  }

  async function removeFolder(id: string) {
    try {
      await deleteFolder(id);
      if (folderId === id) setFolderId(undefined);
      await fetchFolders();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("canvas.folderNotEmpty"));
    }
  }

  return (
    <>
    <DrawerFrame
      title={t("assets.title")}
      onClose={onClose}
      actions={
        <>
          <label className="drawer-icon cursor-pointer" title={t("assets.upload")}>
            <Upload size={15} />
            <input hidden type="file" accept="image/*,video/*,audio/*" onChange={(event) => { void uploadFromPicker(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          <button type="button" className="drawer-icon" title="新建一级文件夹" onClick={() => void addFolder()}><FolderPlus size={16} /></button>
        </>
      }
    >
      <div className="p-3">
        <div className="studio-tabs grid grid-cols-2"><button className={team === "personal" ? "is-active" : ""} onClick={() => setTeam("personal")}>个人</button><button className={team === "team" ? "is-active" : ""} onClick={() => setTeam("team")}>团队</button></div>
        <label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} /><input className="studio-input h-9 w-full pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索" /></label>
        <button type="button" className="drawer-list-item mt-3"><Star size={15} /> 收藏</button>
        <div className="mt-4 flex items-center justify-between px-2">
          <span className="text-[11px] font-medium text-white/30">文件夹</span>
          <button type="button" className="asset-folder-create" title="新建一级文件夹" onClick={() => void addFolder()}>
            <FolderPlus size={13} />
            <span>新建文件夹</span>
          </button>
        </div>
        <div className="mt-1">
          {folders.length === 0 && <div className="px-2 py-3 text-[11px] text-white/30">暂无文件夹，点击右上角新建。</div>}
          <AssetFolderTree
            folders={folders}
            activeFolderId={folderId}
            compact
            onSelect={setFolderId}
            onCreateChild={(parentId) => void addFolder(parentId)}
            onRename={(folder) => { const name = window.prompt("重命名文件夹", folder.name); if (name?.trim()) void renameFolder(folder.id, name.trim()); }}
            onDelete={(folder) => { if (window.confirm(`确定删除空文件夹“${folder.name}”吗？`)) void removeFolder(folder.id); }}
            onDropAsset={moveToFolder}
            onImportFiles={importFiles}
          />
        </div>
        {visibleAssets.length > 0 && (
          <>
            <div className="mt-5 px-2 text-[11px] font-medium text-white/30">{folderId === undefined ? t("canvas.recentAssets") : t("canvas.currentFolderAssets")}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {visibleAssets.slice(0, 12).map((asset) => {
                const src = absoluteUploadUrl(asset.thumbnailUrl || asset.url);
                return (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(event) => { event.dataTransfer.setData("application/aigc-asset", assetDragPayload(asset)); event.dataTransfer.setData("text/plain", asset.id); event.dataTransfer.effectAllowed = "copyMove"; }}
                    className="drawer-media-tile"
                    title={asset.name}
                  >
                    {asset.type === "image" && src ? <img src={src} alt="" /> : asset.type === "video" && src ? <video src={src} muted /> : <FileAudio size={20} />}
                    <span className="drawer-resource-actions">
                      {(asset.type === "image" || asset.type === "video") && <button type="button" title="预览" onClick={() => setPreview(asset)}><Eye size={12} /></button>}
                      <button type="button" title={t("canvas.addToCanvas")} onClick={() => addAssetNode({ assetId: asset.id, type: asset.type, url: asset.url, filePath: asset.localPath, thumbnailUrl: asset.thumbnailUrl, width: asset.width, height: asset.height, duration: asset.duration })}><Plus size={12} /></button>
                      <button type="button" title="下载" onClick={() => { const link = document.createElement("a"); link.href = absoluteUploadUrl(asset.downloadUrl || asset.url) || ""; link.download = asset.name; link.click(); }}><Download size={12} /></button>
                      <button type="button" title="删除" onClick={() => void deleteAsset(asset.id)}><Trash2 size={12} /></button>
                    </span>
                    <span className="drawer-resource-name">{asset.name}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DrawerFrame>
    <MediaLightbox
      open={Boolean(preview)}
      type={preview?.type === "video" ? "video" : "image"}
      src={absoluteUploadUrl(preview?.url)}
      title={preview?.name}
      meta={[{ label: "尺寸", value: preview?.width && preview?.height ? `${preview.width}×${preview.height}` : undefined }]}
      onClose={() => setPreview(null)}
    />
    </>
  );
}

function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const { histories, fetchHistories, deleteHistory } = useHistoryStore();
  const addAssetNode = useCanvasStore((state) => state.addAssetNode);
  const [tab, setTab] = useState<"image" | "video" | "audio" | "3d">("image");
  const [preview, setPreview] = useState<GenerationHistory | null>(null);

  useEffect(() => {
    fetchHistories().catch(() => undefined);
  }, [fetchHistories]);

  const visible = histories.filter((item) => tab === "image" ? historyKind(item) === "image" : tab === "video" ? historyKind(item) === "video" : false);
  const samples = visible.length ? visible : Array.from({ length: 6 }, (_, index) => ({ id: `mock-${index}`, outputUrl: "", modelDisplayName: "Moon｜Tv" } as GenerationHistory));

  function download(item: GenerationHistory) {
    if (!item.outputUrl) return;
    const link = document.createElement("a");
    link.href = absoluteUploadUrl(item.outputUrl) || "";
    link.download = `${item.modelDisplayName || "generation"}-${item.id}`;
    link.click();
  }

  return (
    <>
    <DrawerFrame title="历史" onClose={onClose}>
      <div className="flex border-b border-white/[0.07] px-3 pt-2">
        {([["image", "图片历史"], ["video", "视频历史"], ["audio", "音频"], ["3d", "3D 世界"]] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`drawer-tab ${tab === value ? "is-active" : ""}`}>{label}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {samples.map((item, index) => {
          const src = absoluteUploadUrl(item.outputUrl);
          const kind = item.outputUrl ? historyKind(item) : tab;
          return (
            <div key={item.id} className={`drawer-history-tile ${!src ? `is-placeholder tone-${index % 4}` : ""}`}>
              {src && kind === "image" ? <img src={src} alt="" /> : src && kind === "video" ? <video src={src} muted /> : <span>{kind === "image" ? <ImageIcon size={19} /> : <Video size={19} />}</span>}
              {item.outputUrl && <span className="drawer-resource-actions">
                <button type="button" title="预览" onClick={() => setPreview(item)}><Eye size={12} /></button>
                <button type="button" title="加入画布" onClick={() => addAssetNode({ assetId: item.id, type: kind === "image" ? "image" : "video", url: item.outputUrl, aspectRatio: item.aspectRatio, duration: item.duration })}><Plus size={12} /></button>
                <button type="button" title="下载" onClick={() => download(item)}><Download size={12} /></button>
                <button type="button" title="删除" onClick={() => void deleteHistory(item.id)}><Trash2 size={12} /></button>
              </span>}
              {item.modelDisplayName && <span className="drawer-resource-name">{item.modelDisplayName}</span>}
            </div>
          );
        })}
      </div>
    </DrawerFrame>
    <MediaLightbox
      open={Boolean(preview)}
      type={preview && historyKind(preview) === "image" ? "image" : "video"}
      src={absoluteUploadUrl(preview?.outputUrl)}
      title={preview?.modelDisplayName || "生成结果"}
      meta={[
        { label: "比例", value: preview?.aspectRatio },
        { label: "清晰度", value: preview?.resolution },
        { label: "时长", value: preview?.duration ? `${preview.duration}s` : undefined }
      ]}
      onClose={() => setPreview(null)}
    />
    </>
  );
}

function TemplateDrawer({ onClose }: { onClose: () => void }) {
  const applyPlan = useCanvasStore((state) => state.applyAgentWorkflowPlan);
  const [tab, setTab] = useState<"public" | "mine">("public");
  const [keyword, setKeyword] = useState("");

  function insert(title: string) {
    applyPlan({
      id: `template-${Date.now()}`, title, goal: title, summary: "模板插入", warnings: [],
      nodes: [
        { tempId: "asset", type: "imageAsset", title: "Image", position: { x: 0, y: 40 }, data: {} },
        { tempId: "video", type: "videoGenerate", title: title, position: { x: 470, y: 0 }, data: { prompt: `使用 ${title} 模板生成商品视频`, aspectRatio: "9:16" } }
      ],
      edges: [{ sourceTempId: "asset", targetTempId: "video" }]
    });
    onClose();
  }

  const visible = templateItems.filter((item) => !keyword || item.title.toLowerCase().includes(keyword.toLowerCase()));
  return (
    <DrawerFrame title="模板" onClose={onClose} actions={<button type="button" title="打开模板页" className="drawer-icon" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "templates" }))}><LayoutTemplate size={16} /></button>}>
      <div className="m-3 rounded-[16px] border border-white/[0.08] bg-white/[0.045] p-3.5">
        <div className="text-[13px] font-semibold">使用模板加速创作</div><p className="mt-1 text-[11px] leading-5 text-white/38">一键使用专业结构，快速构建你的专属场景。</p>
      </div>
      <div className="px-3">
        <div className="studio-tabs grid grid-cols-2"><button className={tab === "public" ? "is-active" : ""} onClick={() => setTab("public")}>公共模板</button><button className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")}>我的模板</button></div>
        <label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} /><input className="studio-input h-9 w-full pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索资产包..." /></label>
        <div className="mt-3 grid grid-cols-3 gap-2 pb-4">
          {visible.map((item) => <button key={item.title} type="button" onClick={() => insert(item.title)} className="text-left"><span className={`block aspect-[4/5] rounded-[10px] border border-white/[0.08] bg-gradient-to-br ${item.tone}`} /><span className="mt-1.5 block truncate text-[10px] text-white/58">{item.title}</span></button>)}
        </div>
      </div>
    </DrawerFrame>
  );
}

export function CanvasDrawer({ drawer, onClose }: { drawer: DrawerName; onClose: () => void; onNavigate: (page: Page, projectId?: string) => void }) {
  return <AnimatePresence>{drawer === "assets" ? <AssetDrawer key="assets" onClose={onClose} /> : drawer === "history" ? <HistoryDrawer key="history" onClose={onClose} /> : drawer === "templates" ? <TemplateDrawer key="templates" onClose={onClose} /> : null}</AnimatePresence>;
}

export function CanvasEmptyGuide({ onAdd, onTemplates }: { onAdd: (type: WorkflowNodeType, position?: { x: number; y: number }) => void; onTemplates: () => void }) {
  const t = useI18nStore((state) => state.t);
  const actions: Array<{ label: string; hint: string; type?: WorkflowNodeType; icon: ElementType; position?: { x: number; y: number }; onClick?: () => void; tone: string }> = [
    { label: "故事脚本生成", hint: "剧本、分镜、Shot Prompt", type: "script", icon: ScrollText, position: { x: 180, y: 160 }, tone: "is-blue" },
    { label: "角色三视图", hint: "正侧背设定参考", type: "imageGenerate", icon: UserRound, position: { x: 620, y: 150 }, tone: "is-rose" },
    { label: "首帧图生视频", hint: "首帧、参考图转视频", type: "video", icon: ImageIcon, position: { x: 1060, y: 150 }, tone: "is-amber" },
    { label: "音频生视频", hint: "音乐、旁白驱动画面", type: "audio", icon: FileAudio, position: { x: 1500, y: 160 }, tone: "is-teal" }
  ];
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-8">
      <motion.div layout className="canvas-empty-guide pointer-events-auto" transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
        <div className="canvas-empty-kicker">{t("canvas.emptyTitlePrefix")}{t("canvas.emptyTitleSuffix")}</div>
        <div className="canvas-empty-actions">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`canvas-empty-task ${item.tone}`}
                onClick={() => item.onClick ? item.onClick() : item.type && onAdd(item.type, item.position)}
              >
                <span className="canvas-empty-task-icon"><Icon size={18} /></span>
                <span className="canvas-empty-task-text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={onTemplates} className="canvas-empty-task is-template">
            <span className="canvas-empty-task-icon"><LayoutTemplate size={18} /></span>
            <span className="canvas-empty-task-text"><strong>模板工作流</strong><small>从预设结构开始</small></span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function ShareProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProjectStore((state) => state.currentProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useI18nStore((state) => state.t);
  const shareUrl = `${window.location.origin}/canvas/${project?.id || "new"}`;
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[10000] grid place-items-center bg-black/62 p-5 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div className="share-modal" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h2 className="text-[18px] font-semibold">{t("canvas.shareTitle")}</h2><p className="mt-1 text-[12px] text-white/38">{t("canvas.shareDesc")}</p></div><button type="button" aria-label={t("canvas.shareClose")} title={t("canvas.shareClose")} className="drawer-icon" onClick={onClose}><X size={16} /></button></div>
            <div className="mt-5 flex gap-2"><input ref={inputRef} readOnly value={shareUrl} className="studio-input h-10 min-w-0 flex-1" /><button className="studio-primary-button" onClick={() => navigator.clipboard.writeText(shareUrl)}><Copy size={14} /> 复制</button></div>
            <div className="mt-4 flex gap-2"><button className="studio-secondary-button"><UsersRound size={14} /> 团队可查看</button><button className="studio-secondary-button"><Link2 size={14} /> 链接访问</button></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
