import { Maximize2, Save } from "lucide-react";
import { Button } from "../common/Button";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";

export function CanvasToolbar() {
  const { nodes, edges } = useCanvasStore();
  const saveProject = useProjectStore((state) => state.saveProject);
  return (
    <div className="absolute right-5 top-5 z-10 flex gap-2 rounded-lg border border-white/10 bg-[#0d1424]/95 p-2">
      <Button className="bg-white/10" onClick={() => saveProject(nodes, edges)}>
        <Save size={15} className="inline" /> 淇濆瓨
      </Button>
      <Button className="bg-white/10">
        <Maximize2 size={15} className="inline" /> 适配视图
      </Button>
    </div>
  );
}

