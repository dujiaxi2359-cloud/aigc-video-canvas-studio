import { Play, Save } from "lucide-react";
import { Button } from "../common/Button";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { ExportMenu } from "./ExportMenu";

export function TopBar() {
  const { nodes, edges } = useCanvasStore();
  const { currentProject, saveProject } = useProjectStore();

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-[52px] items-center justify-between border-b border-white/[0.055] bg-[#020203]/[0.68] px-5 backdrop-blur-[20px]">
      <div className="pl-[78px]">
        <div className="text-[11px] font-medium text-white/32">当前项目</div>
        <div className="text-[15px] font-semibold leading-5 text-white/82">{currentProject?.name ?? "AIGC 视频工作流"}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button className="h-9" variant="secondary" onClick={() => saveProject(nodes, edges)}>
          <Save size={14} /> 保存项目
        </Button>
        <Button className="h-9" variant="primary">
          <Play size={14} /> 运行当前节点
        </Button>
        <ExportMenu nodes={nodes} edges={edges} currentProject={currentProject} />
      </div>
    </header>
  );
}
