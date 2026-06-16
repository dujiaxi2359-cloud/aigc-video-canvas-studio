import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileJson, FileVideo, FolderArchive, ImageDown, Layers, Library, Loader2 } from "lucide-react";
import type { Edge, Node } from "reactflow";
import { Button } from "../common/Button";
import {
  exportOutputAssets,
  exportProjectJson,
  exportProjectPackage,
  extensionFromUrl,
  sanitizeFilename,
  timestamp,
  type ExportAsset,
  type ExportProject
} from "../../services/exportApi";
import type { Project } from "../../types/project";

type ExportMenuProps = {
  nodes: Node[];
  edges: Edge[];
  currentProject?: Project;
};

function nodeTitle(node: Node) {
  const data = (node.data ?? {}) as { title?: string };
  return data.title || node.type || node.id;
}

function assetTypeForNode(node: Node): ExportAsset["type"] | null {
  if (node.type === "imageGenerate") return "image";
  if (node.type === "video") return "video";
  if (node.type === "compose") return "compose";
  if (node.type === "audio") return "audio";
  return null;
}

function collectAssets(nodes: Node[], onlySelected = false): ExportAsset[] {
  return nodes
    .filter((node) => !onlySelected || node.selected)
    .flatMap((node) => {
      const data = (node.data ?? {}) as { status?: string; outputUrl?: string; url?: string };
      const type = assetTypeForNode(node);
      const url = data.outputUrl || (type === "audio" ? data.url : "");
      if (!type || !url || (data.status && data.status !== "success")) return [];
      const title = nodeTitle(node);
      const ext = extensionFromUrl(url, type === "image" ? ".png" : type === "audio" ? ".mp3" : ".mp4");
      const filename = `${type}_${sanitizeFilename(title)}_${timestamp()}${ext}`;
      return [{ nodeId: node.id, nodeTitle: title, type, url, filename }];
    });
}

function buildProject(currentProject: Project | undefined, nodes: Node[], edges: Edge[]): ExportProject {
  const now = new Date().toISOString();
  return {
    projectName: currentProject?.name || "Moon｜Tv 视频工作流",
    version: "0.1.0",
    createdAt: currentProject?.createdAt ? new Date(currentProject.createdAt).toISOString() : now,
    updatedAt: now,
    nodes,
    edges,
    viewport: {},
    settingsSnapshot: {
      note: "Model identifiers may be exported, but API keys and secrets are intentionally excluded."
    }
  };
}

export function ExportMenu({ nodes, edges, currentProject }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const project = useMemo(() => buildProject(currentProject, nodes, edges), [currentProject, edges, nodes]);
  const allAssets = useMemo(() => collectAssets(nodes), [nodes]);
  const selectedAssets = useMemo(() => collectAssets(nodes, true), [nodes]);
  const composeAssets = useMemo(() => allAssets.filter((asset) => asset.type === "compose"), [allAssets]);

  async function run(label: string, action: () => Promise<void> | void) {
    setLoading(true);
    setStatus("正在导出...");
    try {
      await action();
      setStatus(`${label}完成`);
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }

  const items = [
    {
      label: "导出当前项目 JSON",
      icon: FileJson,
      onClick: () => run("项目 JSON 导出", () => exportProjectJson(project))
    },
    {
      label: "导出所有生成素材",
      icon: ImageDown,
      onClick: () => run("生成素材导出", () => exportOutputAssets(project, allAssets, "当前项目还没有可导出的生成素材。"))
    },
    {
      label: "导出选中节点结果",
      icon: Layers,
      onClick: () => run("选中节点结果导出", () => exportOutputAssets(project, selectedAssets, "当前选中节点没有可导出的生成结果。"))
    },
    {
      label: "导出最终合成视频",
      icon: FileVideo,
      onClick: () => run("合成视频导出", () => exportOutputAssets(project, composeAssets, "暂无合成视频，请先运行视频合成节点。")),
      disabled: composeAssets.length === 0
    },
    {
      label: "导出完整项目包 ZIP",
      icon: FolderArchive,
      onClick: () => run("项目包导出", () => exportProjectPackage(project, allAssets))
    },
    {
      label: "打开素材库",
      icon: Library,
      onClick: () => {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("navigate", { detail: "assets" }));
      }
    }
  ];

  return (
    <div className="relative">
      <Button className="h-9" variant="secondary" onClick={() => setOpen((value) => !value)}>
        <Download size={14} /> 导出
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-[80] w-[248px] rounded-[14px] border border-white/[0.08] bg-[#111724]/[0.92] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.36)] backdrop-blur-[20px]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled || loading}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  item.onClick();
                }}
                className="nodrag nopan flex h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-[13px] text-white/76 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-white/28 disabled:hover:bg-transparent"
              >
                <Icon size={15} strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
          {status && (
            <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-[12px] leading-5 text-white/62">
              {loading ? <Loader2 className="mt-0.5 animate-spin" size={13} /> : <CheckCircle2 className="mt-0.5" size={13} />}
              <span>{status}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
