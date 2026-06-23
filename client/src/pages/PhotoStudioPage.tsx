import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Image } from "lucide-react";
import type { Page } from "../App";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";

export function PhotoStudioPage({ onNavigate }: { onNavigate: (page: Page, projectId?: string) => void }) {
  const startedRef = useRef(false);
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createProject = useProjectStore((state) => state.createProject);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function openPhotoCanvas() {
      const defaultPrompt = "图文创作项目";
      clearCanvas();
      addNode("textGenerate", { x: 220, y: 150 });
      addNode("imageGenerate", { x: 700, y: 130 });

      const canvas = useCanvasStore.getState();
      const textNode = canvas.nodes.find((node) => node.type === "textGenerate");
      const imageNode = canvas.nodes.find((node) => node.type === "imageGenerate");
      if (textNode) updateNodeData(textNode.id, { title: "图文策划", prompt: defaultPrompt, taskType: "prompt-polish" });
      if (imageNode) updateNodeData(imageNode.id, { title: "图像生成", prompt: defaultPrompt, aspectRatio: "auto", inputMode: "text-to-image" });
      if (textNode && imageNode) {
        useCanvasStore.getState().connectNodes({ source: textNode.id, sourceHandle: "out", target: imageNode.id, targetHandle: "in-0" });
      }

      try {
        const project = await createProject("图文创作项目");
        await useProjectStore.getState().saveProject(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
        onNavigate("canvas", project.id);
      } catch {
        onNavigate("canvas", "new");
      }
    }

    void openPhotoCanvas();
  }, [addNode, clearCanvas, createProject, onNavigate, updateNodeData]);

  return (
    <motion.div
      className="grid h-full place-items-center bg-[#050608] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-white/[0.1] bg-white/[0.05] text-white/78">
          <Image size={24} />
        </span>
        <div className="mt-5 text-[18px] font-semibold">正在打开图文画布</div>
        <p className="mt-2 text-[13px] text-white/36">正在为你创建图文策划和图片生成节点...</p>
      </div>
    </motion.div>
  );
}
