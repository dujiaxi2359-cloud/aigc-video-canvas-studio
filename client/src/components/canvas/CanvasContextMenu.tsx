import type { Edge, Node } from "reactflow";
import { useCanvasStore } from "../../store/canvasStore";

export type CanvasMenuState =
  | { type: "edge"; edge: Edge; node?: Node; position: { x: number; y: number } }
  | { type: "node"; node: Node; position: { x: number; y: number } }
  | { type: "pane"; position: { x: number; y: number } };

function MenuButton({ children, danger, onClick }: { children: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`block h-9 w-full rounded-lg px-3 text-left text-[12px] transition ${danger ? "text-red-200 hover:bg-red-400/10" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function CanvasContextMenu({ menu, onClose }: { menu: CanvasMenuState; onClose: () => void }) {
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const disconnectNode = useCanvasStore((state) => state.disconnectNode);
  const disconnectNodeInputs = useCanvasStore((state) => state.disconnectNodeInputs);
  const disconnectNodeOutputs = useCanvasStore((state) => state.disconnectNodeOutputs);
  const deleteUnconnectedNodes = useCanvasStore((state) => state.deleteUnconnectedNodes);
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);

  function run(action: () => void) {
    action();
    onClose();
  }

  const node = menu.type === "node" ? menu.node : menu.type === "edge" ? menu.node : undefined;

  return (
    <div
      className="nodrag nopan fixed z-[9999] w-[220px] rounded-2xl border border-white/[0.08] bg-[#11141b]/95 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
      style={{ left: menu.position.x, top: menu.position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      {menu.type === "edge" && (
        <>
          <MenuButton danger onClick={() => run(() => deleteEdge(menu.edge.id))}>删除连线</MenuButton>
          {node && <MenuButton onClick={() => run(() => disconnectNodeInputs(node.id))}>删除此节点所有输入连接</MenuButton>}
          {node && <MenuButton onClick={() => run(() => disconnectNodeOutputs(node.id))}>删除此节点所有输出连接</MenuButton>}
          {node && <MenuButton onClick={() => run(() => disconnectNode(node.id))}>删除此节点全部连接</MenuButton>}
        </>
      )}

      {menu.type === "node" && (
        <>
          <MenuButton danger onClick={() => run(() => deleteNode(menu.node.id))}>删除节点和关联连线</MenuButton>
          <MenuButton onClick={() => run(() => disconnectNodeInputs(menu.node.id))}>只删除输入连线</MenuButton>
          <MenuButton onClick={() => run(() => disconnectNodeOutputs(menu.node.id))}>只删除输出连线</MenuButton>
          <MenuButton onClick={() => run(() => disconnectNode(menu.node.id))}>断开所有连接</MenuButton>
          <MenuButton onClick={() => run(() => duplicateNode(menu.node.id))}>复制节点</MenuButton>
          <MenuButton onClick={onClose}>锁定节点（后续）</MenuButton>
        </>
      )}

      {menu.type === "pane" && (
        <>
          <MenuButton
            danger
            onClick={() => {
              if (window.confirm("确定清空当前画布吗？此操作会删除所有节点和连线。")) run(clearCanvas);
            }}
          >
            清空画布
          </MenuButton>
          <MenuButton onClick={() => run(deleteUnconnectedNodes)}>删除未连接节点</MenuButton>
        </>
      )}
    </div>
  );
}

