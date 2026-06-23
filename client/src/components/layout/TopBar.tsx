import { useState } from "react";
import { Bell, Play, Save, Settings2 } from "lucide-react";
import { Button } from "../common/Button";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { ExportMenu } from "./ExportMenu";

const runnableNodeTypes = new Set(["textGenerate", "imageGenerate", "video", "compose"]);

export function TopBar() {
  const { nodes, edges, selectedNodeId } = useCanvasStore();
  const { currentProject, saveProject } = useProjectStore();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes.find((node) => node.selected);

  async function handleSaveProject() {
    setSaveStatus("saving");
    try {
      await saveProject(nodes, edges);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1400);
    } catch (error) {
      setSaveStatus("idle");
      window.alert(error instanceof Error ? `保存失败：${error.message}` : "保存失败，请检查后端服务。");
    }
  }

  function runSelectedNode() {
    if (!selectedNode) {
      window.alert("请先在画布中选中一个要运行的节点。");
      return;
    }
    if (!selectedNode.type || !runnableNodeTypes.has(selectedNode.type)) {
      window.alert("当前选中的节点不能直接运行，请选择创意工作台、图片生成、视频生成或合成节点。");
      return;
    }
    window.dispatchEvent(new CustomEvent("studio:run-node", { detail: { nodeId: selectedNode.id, nodeType: selectedNode.type } }));
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-[58px] items-center justify-between border-b border-white/[0.07] bg-[#08080a]/[0.78] px-4 backdrop-blur-2xl">
      <div className="flex items-center gap-4 pl-[74px]">
        <div className="flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-300 text-[10px] font-black text-black">N</span>
          <span className="text-[13px] font-extrabold tracking-[0.08em] text-white">Moon｜Tv</span>
        </div>
        <div className="hidden h-8 items-center gap-2 rounded-full bg-white/[0.035] px-3 text-[13px] text-white/72 md:flex">
          <span className="text-white/34">工作空间</span>
          <span className="max-w-[280px] truncate font-semibold text-white/86">{currentProject?.name ?? "Moon｜Tv 视频工作流"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" title="通知" className="grid h-9 w-9 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.06] hover:text-white">
          <Bell size={17} />
        </button>
        <button type="button" title="设置" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "settings" }))} className="grid h-9 w-9 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.06] hover:text-white">
          <Settings2 size={17} />
        </button>
        <Button className="h-9 rounded-full" variant="secondary" disabled={saveStatus === "saving"} onClick={handleSaveProject}>
          <Save size={14} /> {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : "保存项目"}
        </Button>
        <Button className="h-9 rounded-full bg-cyan-300 text-black shadow-[0_0_24px_rgba(34,211,238,0.26)] hover:bg-cyan-200" variant="primary" onClick={runSelectedNode}>
          <Play size={14} /> 运行当前节点
        </Button>
        <ExportMenu nodes={nodes} edges={edges} currentProject={currentProject} />
      </div>
    </header>
  );
}
