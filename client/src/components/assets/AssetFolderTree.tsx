import { useMemo, useRef, useState } from "react";
import { ChevronDown, Edit3, Folder, FolderPlus, MoreHorizontal, Trash2, Upload } from "lucide-react";
import type { AssetFolder } from "../../types/asset";

type Props = {
  folders: AssetFolder[];
  activeFolderId?: string | null;
  onSelect: (folderId: string | null | undefined) => void;
  onCreateChild: (parentId: string) => void;
  onRename: (folder: AssetFolder) => void;
  onDelete: (folder: AssetFolder) => void;
  onDropAsset: (assetId: string, folderId: string | null) => void | Promise<void>;
  onImportFiles: (files: File[], folderId: string | null) => void | Promise<void>;
  compact?: boolean;
};

function draggedAssetId(event: React.DragEvent) {
  const payload = event.dataTransfer.getData("application/aigc-asset");
  if (payload) {
    try {
      const parsed = JSON.parse(payload) as { assetId?: string };
      if (parsed.assetId) return parsed.assetId;
    } catch {
      // Older cards may only expose the id through text/plain.
    }
  }
  return event.dataTransfer.getData("text/plain") || "";
}

export function AssetFolderTree({ folders, activeFolderId, onSelect, onCreateChild, onRename, onDelete, onDropAsset, onImportFiles, compact = false }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { roots, childrenByParent } = useMemo(() => {
    const folderIds = new Set(folders.map((folder) => folder.id));
    const childMap = new Map<string, AssetFolder[]>();
    const rootFolders: AssetFolder[] = [];
    folders.forEach((folder) => {
      if (!folder.parentId || !folderIds.has(folder.parentId)) {
        rootFolders.push(folder);
        return;
      }
      const children = childMap.get(folder.parentId) || [];
      children.push(folder);
      childMap.set(folder.parentId, children);
    });
    return { roots: rootFolders, childrenByParent: childMap };
  }, [folders]);

  function toggle(folderId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }

  function acceptDrop(event: React.DragEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetId(null);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      void onImportFiles(files, folderId);
      return;
    }
    const assetId = draggedAssetId(event);
    if (assetId) void onDropAsset(assetId, folderId);
  }

  function openImport(folderId: string | null) {
    setMenuId(null);
    setImportFolderId(folderId);
    window.setTimeout(() => importInputRef.current?.click(), 0);
  }

  function FolderRow({ folder, depth }: { folder: AssetFolder; depth: 0 | 1 }) {
    const children = depth === 0 ? childrenByParent.get(folder.id) || [] : [];
    const expanded = expandedIds.has(folder.id) || children.some((child) => child.id === activeFolderId);
    const active = activeFolderId === folder.id;
    return (
      <div className="asset-folder-branch">
        <div
          className={`asset-folder-row ${active ? "is-active" : ""} ${dropTargetId === folder.id ? "is-drop-target" : ""} ${compact ? "is-compact" : ""}`}
          style={{ paddingLeft: `${8 + depth * 20}px` }}
          onDragEnter={(event) => { event.preventDefault(); setDropTargetId(folder.id); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes("Files") ? "copy" : "move"; }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null); }}
          onDrop={(event) => acceptDrop(event, folder.id)}
        >
          <button type="button" className="asset-folder-chevron" aria-label={expanded ? "收起" : "展开"} onClick={() => toggle(folder.id)} disabled={children.length === 0}>
            <ChevronDown size={13} className={expanded ? "" : "-rotate-90"} />
          </button>
          <button type="button" className="asset-folder-name" onClick={() => onSelect(folder.id)}>
            <Folder size={15} /><span>{folder.name}</span>
          </button>
          <button type="button" className="asset-folder-more" title="文件夹设置" onClick={() => setMenuId(menuId === folder.id ? null : folder.id)}><MoreHorizontal size={15} /></button>
          {menuId === folder.id && (
            <div className="asset-folder-menu">
              <button type="button" onClick={() => openImport(folder.id)}><Upload size={13} /> 导入素材</button>
              {depth === 0 && <button type="button" onClick={() => { setMenuId(null); setExpandedIds((current) => new Set(current).add(folder.id)); onCreateChild(folder.id); }}><FolderPlus size={13} /> 新建二级分组</button>}
              <button type="button" onClick={() => { setMenuId(null); onRename(folder); }}><Edit3 size={13} /> 重命名</button>
              <button type="button" className="is-danger" onClick={() => { setMenuId(null); onDelete(folder); }}><Trash2 size={13} /> 删除</button>
            </div>
          )}
        </div>
        {expanded && children.map((child) => <FolderRow key={child.id} folder={child} depth={1} />)}
      </div>
    );
  }

  return (
    <div className="asset-folder-tree">
      <input
        ref={importInputRef}
        hidden
        multiple
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) void onImportFiles(files, importFolderId);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={`asset-folder-root ${activeFolderId === undefined ? "is-active" : ""} ${dropTargetId === "root" ? "is-drop-target" : ""}`}
        onClick={() => onSelect(undefined)}
        onDragEnter={(event) => { event.preventDefault(); setDropTargetId("root"); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes("Files") ? "copy" : "move"; }}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={(event) => acceptDrop(event, null)}
      >
        <Folder size={15} /> 全部素材
      </button>
      {roots.map((folder) => <FolderRow key={folder.id} folder={folder} depth={0} />)}
    </div>
  );
}
