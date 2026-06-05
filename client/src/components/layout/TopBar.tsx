import { useState } from "react";
import { Play, Save } from "lucide-react";
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
      window.alert("当前选中的节点不能直接运行，请选择智能体、图片生成、视频生成或合成节点。");
      return;
    }
    window.dispatchEvent(new CustomEvent("studio:run-node", { detail: { nodeId: selectedNode.id, nodeType: selectedNode.type } }));
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-[52px] items-center justify-between border-b border-white/[0.055] bg-[#020203]/[0.68] px-5 backdrop-blur-[20px]">
      <div className="pl-[78px]">
        <div className="text-[11px] font-medium text-white/32">当前项目</div>
        <div className="text-[15px] font-semibold leading-5 text-white/82">{currentProject?.name ?? "AIGC 视频工作流"}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button className="h-9" variant="secondary" disabled={saveStatus === "saving"} onClick={handleSaveProject}>
          <Save size={14} /> {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : "保存项目"}
        </Button>
        <Button className="h-9" variant="primary" onClick={runSelectedNode}>
          <Play size={14} /> 运行当前节点
        </Button>
        <ExportMenu nodes={nodes} edges={edges} currentProject={currentProject} />
      </div>
    </header>
  );
}
