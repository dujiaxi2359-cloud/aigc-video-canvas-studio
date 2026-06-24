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
  const restoreLastDeletion = useCanvasStore((state) => state.restoreLastDeletion);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget()) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const { nodes, edges } = useCanvasStore.getState();
        if (nodes.some((node) => node.selected) || edges.some((edge) => edge.selected)) deleteSelected();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && useCanvasStore.getState().lastDeletion) {
        event.preventDefault();
        restoreLastDeletion();
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
  }, [clearSelection, deleteSelected, duplicateNode, restoreLastDeletion, selectAll]);
}
