import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive, ChevronDown, Clock3, Copy, Folder, FolderOpen, FolderPlus, Grid2X2, Heart,
  List, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, X
} from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import type { Project } from "../types/project";
import { absoluteUploadUrl } from "../utils/file";
import { formatTime } from "../utils/time";

type FolderFilter = "all" | "recent" | "favorite" | "uncategorized" | "archived" | string;
type DialogState =
  | { type: "folder" }
  | { type: "rename-folder"; id: string; value: string }
  | { type: "rename-project"; id: string; value: string }
  | { type: "move"; id: string }
  | { type: "delete-folder"; id: string; value: string }
  | { type: "delete-project"; id: string; value: string }
  | null;

const virtualFolders = [
  { id: "all", label: "全部项目", icon: FolderOpen },
  { id: "recent", label: "最近打开", icon: Clock3 },
  { id: "favorite", label: "收藏", icon: Star },
  { id: "uncategorized", label: "未分类", icon: Folder },
  { id: "archived", label: "已归档", icon: Archive }
] as const;

function projectCover(project: Project) {
  for (const node of project.nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const source = data.thumbnailUrl || data.outputUrl || data.url;
    if (typeof source === "string" && source) return absoluteUploadUrl(source);
  }
  return undefined;
}

function DraggableProject({ project, children }: { project: Project; children: (input: { attributes: ReturnType<typeof useDraggable>["attributes"]; listeners: ReturnType<typeof useDraggable>["listeners"]; setNodeRef: ReturnType<typeof useDraggable>["setNodeRef"]; isDragging: boolean }) => ReactNode }) {
  const draggable = useDraggable({ id: `project:${project.id}`, data: { type: "project", projectId: project.id, name: project.name } });
  return <>{children(draggable)}</>;
}

function DroppableFolder({ id, children }: { id?: string; children: (input: { setNodeRef: ReturnType<typeof useDroppable>["setNodeRef"]; isOver: boolean }) => React.ReactNode }) {
  const droppable = useDroppable({ id: `folder:${id ?? "root"}`, data: { type: "folder", folderId: id } });
  return <>{children({ setNodeRef: droppable.setNodeRef, isOver: droppable.isOver })}</>;
}

function WorkspaceDialog({ dialog, folders, onClose, onSubmit }: {
  dialog: DialogState;
  folders: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSubmit: (value?: string) => void | Promise<void>;
}) {
  const initialValue = dialog && "value" in dialog ? dialog.value : "";
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue, dialog?.type]);
  if (!dialog) return null;

  const isMove = dialog.type === "move";
  const isDelete = dialog.type === "delete-folder" || dialog.type === "delete-project";
  const title = dialog.type === "folder" ? "新建文件夹" : dialog.type === "rename-folder" ? "重命名文件夹" : dialog.type === "rename-project" ? "重命名项目" : dialog.type === "move" ? "移动到文件夹" : dialog.type === "delete-folder" ? "删除文件夹" : "删除项目";

  return (
    <motion.div className="fixed inset-0 z-[1000] grid place-items-center bg-black/65 p-5 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div className="workspace-dialog" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-[16px] font-semibold">{title}</h2><button type="button" className="drawer-icon" onClick={onClose}><X size={15} /></button></div>
        {isMove ? (
          <div className="mt-4 grid gap-1.5">
            <button type="button" className="workspace-dialog-option" onClick={() => void onSubmit(undefined)}><Folder size={16} /> 未分类</button>
            {folders.map((folder) => <button key={folder.id} type="button" className="workspace-dialog-option" onClick={() => void onSubmit(folder.id)}><Folder size={16} /> {folder.name}</button>)}
          </div>
        ) : isDelete ? (
          <>
            <p className="mt-4 text-[13px] leading-6 text-white/52">{dialog.type === "delete-folder" ? `删除“${dialog.value}”后，里面的项目会回到未分类，不会被删除。` : `“${dialog.value}”将被永久删除，此操作无法撤销。`}</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="studio-secondary-button" onClick={onClose}>取消</button><button type="button" className="workspace-danger-button" onClick={() => void onSubmit()}>确认删除</button></div>
          </>
        ) : (
          <form className="mt-4" onSubmit={(event) => { event.preventDefault(); if (value.trim()) void onSubmit(value.trim()); }}>
            <input autoFocus className="studio-input h-11 w-full px-4" value={value} onChange={(event) => setValue(event.target.value)} placeholder={dialog.type === "folder" ? "输入文件夹名称" : "输入新名称"} />
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="studio-secondary-button" onClick={onClose}>取消</button><button type="submit" className="studio-primary-button" disabled={!value.trim()}>保存</button></div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

export function WorkspacePage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const [keyword, setKeyword] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [sortBy, setSortBy] = useState<"updated" | "created">("updated");
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const loadCanvasProject = useCanvasStore((state) => state.loadProject);
  const store = useProjectStore();

  useEffect(() => { store.fetchProjects().catch(() => undefined); }, [store.fetchProjects]);

  const visibleProjects = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return store.projects
      .filter((project) => {
        const meta = store.projectMeta[project.id];
        if (folderFilter === "archived") return Boolean(meta?.isArchived);
        if (meta?.isArchived) return false;
        if (folderFilter === "favorite") return Boolean(meta?.isFavorite);
        if (folderFilter === "uncategorized") return !meta?.folderId;
        if (folderFilter === "recent" || folderFilter === "all") return true;
        return meta?.folderId === folderFilter;
      })
      .filter((project) => !term || project.name.toLowerCase().includes(term))
      .sort((a, b) => sortBy === "created" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt);
  }, [folderFilter, keyword, sortBy, store.projectMeta, store.projects]);

  async function createNewProject() {
    clearCanvas();
    try {
      const folderId = !["all", "recent", "favorite", "uncategorized", "archived"].includes(folderFilter) ? folderFilter : undefined;
      const project = await store.createProject("未命名项目", folderId);
      onNavigate("canvas", project.id);
    } catch {
      onNavigate("canvas", "new");
    }
  }

  async function openProject(id: string) {
    try {
      const project = await store.loadProject(id);
      loadCanvasProject(project.nodes, project.edges);
      onNavigate("canvas", project.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "项目打开失败");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const projectId = typeof event.active.data.current?.projectId === "string" ? event.active.data.current.projectId : null;
    setDraggingProjectId(projectId);
    setMenuProjectId(null);
    setFolderMenuId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const projectId = typeof event.active.data.current?.projectId === "string" ? event.active.data.current.projectId : undefined;
    const folderId = event.over?.data.current?.folderId as string | undefined;
    if (projectId && event.over?.data.current?.type === "folder") store.moveProject(projectId, folderId);
    setDraggingProjectId(null);
  }

  async function submitDialog(value?: string) {
    if (!dialog) return;
    if (dialog.type === "folder" && value) {
      const folder = store.createFolder(value);
      setFolderFilter(folder.id);
    } else if (dialog.type === "rename-folder" && value) store.renameFolder(dialog.id, value);
    else if (dialog.type === "rename-project" && value) await store.renameProject(dialog.id, value);
    else if (dialog.type === "move") store.moveProject(dialog.id, value);
    else if (dialog.type === "delete-folder") { store.deleteFolder(dialog.id); setFolderFilter("all"); }
    else if (dialog.type === "delete-project") await store.deleteProject(dialog.id);
    setDialog(null);
  }

  const currentFolderName = virtualFolders.find((item) => item.id === folderFilter)?.label ?? store.folders.find((folder) => folder.id === folderFilter)?.name ?? "全部项目";

  const draggingProject = draggingProjectId ? store.projects.find((project) => project.id === draggingProjectId) : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDraggingProjectId(null)}>
    <motion.div className="studio-page min-h-full overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { setMenuProjectId(null); setFolderMenuId(null); }}>
      <HomeTopNav page="workspace" onNavigate={onNavigate} />
      <main className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-title">项目空间</div>
          <nav className="mt-3 grid gap-1">
            {virtualFolders.map((item) => {
              const Icon = item.icon;
              return (
                <DroppableFolder key={item.id}>
                  {({ setNodeRef, isOver }) => <button ref={setNodeRef} type="button" onClick={() => setFolderFilter(item.id)} className={`workspace-folder-row ${folderFilter === item.id ? "is-active" : ""} ${isOver ? "is-drop-target" : ""}`}><Icon size={16} /><span>{item.label}</span></button>}
                </DroppableFolder>
              );
            })}
          </nav>
          <div className="mt-7 flex items-center justify-between px-2"><span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/26">我的文件夹</span><button type="button" title="新建文件夹" className="workspace-mini-button" onClick={(event) => { event.stopPropagation(); setDialog({ type: "folder" }); }}><Plus size={14} /></button></div>
          <div className="mt-2 grid gap-1">
            {store.folders.map((folder) => (
              <DroppableFolder key={folder.id} id={folder.id}>
                {({ setNodeRef, isOver }) => <div ref={setNodeRef} className="relative">
                <button type="button" onClick={() => setFolderFilter(folder.id)} className={`workspace-folder-row w-full ${folderFilter === folder.id ? "is-active" : ""} ${isOver ? "is-drop-target" : ""}`}><Folder size={16} /><span className="min-w-0 flex-1 truncate text-left">{folder.name}</span></button>
                <button type="button" title="文件夹操作" className="workspace-folder-more" onClick={(event) => { event.stopPropagation(); setFolderMenuId(folderMenuId === folder.id ? null : folder.id); }}><MoreHorizontal size={14} /></button>
                {folderMenuId === folder.id && <div className="workspace-context-menu left-[166px] top-8" onClick={(event) => event.stopPropagation()}><button onClick={() => { setDialog({ type: "rename-folder", id: folder.id, value: folder.name }); setFolderMenuId(null); }}><Pencil size={14} /> 重命名</button><button className="is-danger" onClick={() => { setDialog({ type: "delete-folder", id: folder.id, value: folder.name }); setFolderMenuId(null); }}><Trash2 size={14} /> 删除文件夹</button></div>}
              </div>}
              </DroppableFolder>
            ))}
            {store.folders.length === 0 && <button type="button" className="workspace-folder-empty" onClick={(event) => { event.stopPropagation(); setDialog({ type: "folder" }); }}>+ 创建第一个文件夹</button>}
          </div>
        </aside>

        <section className="workspace-content">
          <header className="workspace-heading">
            <div><div className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/28">Workspace</div><h1 className="mt-2 text-[30px] font-semibold text-white">{currentFolderName}</h1><p className="mt-1 text-[12px] text-white/34">{visibleProjects.length} 个项目，按{sortBy === "updated" ? "最近更新" : "创建时间"}排列</p></div>
            <div className="workspace-tools">
              <label className="workspace-search"><Search size={15} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索当前文件夹" /></label>
              <button type="button" className="workspace-sort" onClick={() => setSortBy((value) => value === "updated" ? "created" : "updated")}>{sortBy === "updated" ? "最近更新" : "创建时间"}<ChevronDown size={13} /></button>
              <div className="workspace-view-toggle"><button title="网格视图" type="button" onClick={() => setView("grid")} className={view === "grid" ? "is-active" : ""}><Grid2X2 size={16} /></button><button title="列表视图" type="button" onClick={() => setView("list")} className={view === "list" ? "is-active" : ""}><List size={17} /></button></div>
              <button type="button" title="新建文件夹" className="workspace-tool-button" onClick={() => setDialog({ type: "folder" })}><FolderPlus size={17} /></button>
              <button type="button" onClick={() => void createNewProject()} className="workspace-create-button"><Plus size={16} /> 新建项目</button>
            </div>
          </header>

          <div className={view === "grid" ? "workspace-project-grid" : "workspace-project-list"}>
            <button type="button" onClick={() => void createNewProject()} className={view === "grid" ? "workspace-new-project" : "workspace-new-project is-list"}><span><Plus size={21} /></span><strong>新建项目</strong><small>从空白画布开始</small></button>
            {visibleProjects.map((project, index) => {
              const cover = projectCover(project);
              const meta = store.projectMeta[project.id];
              return (
                <DraggableProject key={project.id} project={project}>
                {({ setNodeRef, attributes, listeners, isDragging }) => <article ref={setNodeRef} {...attributes} {...listeners} className={`workspace-project-card ${view === "list" ? "is-list" : ""} ${isDragging ? "is-dragging" : ""}`} onClick={() => void openProject(project.id)}>
                  <div className={`workspace-project-cover cover-tone-${index % 4}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}><div className="workspace-cover-mark"><span /><span /></div>{meta?.isFavorite && <Star className="workspace-cover-star" size={15} fill="currentColor" />}</div>
                  <div className="workspace-project-info"><div className="min-w-0"><h3>{project.name || "未命名项目"}</h3><p>{project.nodes.length} 个节点 · {formatTime(project.updatedAt)}</p></div><button type="button" title="项目操作" className="workspace-project-more" onClick={(event) => { event.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}><MoreHorizontal size={16} /></button></div>
                  {menuProjectId === project.id && <div className="workspace-context-menu bottom-3 right-3" onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => setDialog({ type: "rename-project", id: project.id, value: project.name })}><Pencil size={14} /> 重命名</button>
                    <button onClick={() => setDialog({ type: "move", id: project.id })}><FolderOpen size={14} /> 移动到文件夹</button>
                    <button onClick={() => void store.duplicateProject(project.id)}><Copy size={14} /> 复制项目</button>
                    <button onClick={() => store.toggleFavorite(project.id)}><Heart size={14} /> {meta?.isFavorite ? "取消收藏" : "收藏"}</button>
                    <button onClick={() => store.setArchived(project.id, !meta?.isArchived)}><Archive size={14} /> {meta?.isArchived ? "取消归档" : "归档"}</button>
                    <button className="is-danger" onClick={() => setDialog({ type: "delete-project", id: project.id, value: project.name })}><Trash2 size={14} /> 删除</button>
                  </div>}
                </article>}
                </DraggableProject>
              );
            })}
          </div>
          {visibleProjects.length === 0 && <div className="workspace-empty"><FolderOpen size={30} /><h3>这里还没有项目</h3><p>把项目拖进这个文件夹，或新建一个项目开始创作。</p><button type="button" onClick={() => void createNewProject()} className="workspace-create-button"><Plus size={16} /> 新建项目</button></div>}
        </section>
      </main>
      <AnimatePresence><WorkspaceDialog dialog={dialog} folders={store.folders} onClose={() => setDialog(null)} onSubmit={submitDialog} /></AnimatePresence>
    </motion.div>
    <DragOverlay>
      {draggingProject ? (
        <div className="workspace-drag-overlay">
          <div className="workspace-cover-mark"><span /><span /></div>
          <strong>{draggingProject.name || "未命名项目"}</strong>
          <small>拖到左侧文件夹移动</small>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
