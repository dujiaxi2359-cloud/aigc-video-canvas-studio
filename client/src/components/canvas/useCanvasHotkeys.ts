import { useEffect } from "react";
import { useCanvasStore } from "../../store/canvasStore";

function isEditableTarget() {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tagName = active.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || active.isContentEditable;
}

export function useCanvasHotkeys() {
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const selectAll = useCanvasStore((state) => state.selectAll);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget()) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const { nodes, edges } = useCanvasStore.getState();
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);
        if (selectedNodes.length > 1 && !window.confirm(`确定删除 ${selectedNodes.length} 个节点及相关连线吗？`)) return;
        if (selectedNodes.length || selectedEdges.length) deleteSelected();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selectedNode = useCanvasStore.getState().nodes.find((node) => node.selected);
        if (selectedNode) duplicateNode(selectedNode.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, deleteSelected, duplicateNode, selectAll]);
}

