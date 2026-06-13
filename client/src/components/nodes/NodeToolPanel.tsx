import { ImagePlus, Library, Plus, Video, X } from "lucide-react";

export type NodeTool = "tags" | "camera" | "styles" | "characters" | "assets" | "quick" | null;

const tags = ["产品特写", "高级质感", "真实人物", "电商广告", "电影光影", "干净背景"];
const motions = ["推近", "拉远", "横移", "环绕", "手持", "俯拍", "跟随", "静态镜头"];
const characters = ["品牌模特 A", "都市男主", "运动女主", "产品手模"];
const assets = ["巴黎街景", "产品白底图", "品牌 Logo", "质感光影"];
const styles = ["电影感", "商业摄影", "极简产品", "胶片颗粒", "自然纪实", "3D 渲染"];

export function NodeToolPanel({ tool, onClose, onInsert }: { tool: NodeTool; onClose: () => void; onInsert: (value: string) => void }) {
  if (!tool) return null;
  const title = tool === "tags" ? "标记" : tool === "camera" ? "运镜与摄影机" : tool === "styles" ? "风格" : tool === "characters" ? "角色库" : tool === "assets" ? "引用素材" : "快速添加";
  const values = tool === "tags" ? tags : tool === "camera" ? motions : tool === "styles" ? styles : tool === "characters" ? characters : tool === "assets" ? assets : [];
  return (
    <div className="node-tool-panel nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><strong>{title}</strong><button type="button" className="drawer-icon" onClick={onClose}><X size={14} /></button></div>
      {tool === "quick" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[{ label: "添加图片素材", type: "image", icon: ImagePlus }, { label: "添加视频素材", type: "video", icon: Video }, { label: "添加文本节点", type: "text", icon: Plus }, { label: "添加参考图", type: "image", icon: ImagePlus }, { label: "添加首帧", type: "image", icon: ImagePlus }, { label: "添加尾帧", type: "image", icon: ImagePlus }].map((item) => {
            const Icon = item.icon;
            return <button key={item.label} type="button" onClick={() => { window.dispatchEvent(new CustomEvent("studio:quick-add-node", { detail: item.type })); onClose(); }}><Icon size={14} />{item.label}</button>;
          })}
          <button type="button" className="col-span-2" onClick={() => { window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "assets" })); onClose(); }}><Library size={14} />打开素材库</button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {values.map((value) => <button key={value} type="button" onClick={() => { onInsert(value); onClose(); }}>{value}</button>)}
          {(tool === "characters" || tool === "assets") && <button type="button" className="col-span-2" onClick={() => { window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "assets" })); onClose(); }}><Library size={14} />从素材库选择</button>}
        </div>
      )}
    </div>
  );
}
