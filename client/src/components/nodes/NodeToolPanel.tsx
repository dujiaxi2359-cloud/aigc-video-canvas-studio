import { useMemo, useState } from "react";
import { Clock3, Gauge, ImagePlus, Library, Plus, Search, SlidersHorizontal, Video, X } from "lucide-react";

export type NodeTool = "tags" | "camera" | "styles" | "characters" | "assets" | "quick" | null;
export type ReferenceMenuItem = {
  token: string;
  typedToken: string;
  label: string;
  kind: string;
  name?: string;
  previewUrl?: string;
};

const tags = ["产品特写", "高级质感", "真实人物", "电商广告", "电影光影", "干净背景"];
const motions = ["推近", "拉远", "横移", "环绕", "手持", "俯拍", "跟随", "静态镜头"];
const characters = ["品牌模特 A", "都市男主", "运动女主", "产品手模"];
const styles = ["电影感", "商业摄影", "极简产品", "胶片颗粒", "自然纪实", "3D 渲染"];

export function NodeToolPanel({
  tool,
  onClose,
  onInsert,
  referenceItems = [],
  referenceTitle = "全能参考",
  showReferenceCommands = true
}: {
  tool: NodeTool;
  onClose: () => void;
  onInsert: (value: string) => void;
  referenceItems?: ReferenceMenuItem[];
  referenceTitle?: string;
  showReferenceCommands?: boolean;
}) {
  const [referenceQuery, setReferenceQuery] = useState("");
  const visibleReferenceItems = useMemo(() => {
    const query = referenceQuery.trim().toLowerCase().replace(/^@+/, "");
    if (!query) return referenceItems;
    return referenceItems.filter((item) => [item.token, item.typedToken, item.label, item.name].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [referenceItems, referenceQuery]);
  if (!tool) return null;
  const title = tool === "tags" ? "标记" : tool === "camera" ? "运镜与摄影机" : tool === "styles" ? "风格" : tool === "characters" ? "角色库" : tool === "assets" ? referenceTitle : "快速添加";
  const values = tool === "tags" ? tags : tool === "camera" ? motions : tool === "styles" ? styles : tool === "characters" ? characters : [];
  const commands = [
    { label: "时间", value: "时间：", icon: Clock3 },
    { label: "镜头", value: "镜头：", icon: ImagePlus },
    { label: "运镜", value: "运镜：", icon: Video },
    { label: "速度", value: "速度：", icon: Gauge }
  ];
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
      ) : tool === "assets" ? (
        <div className="node-reference-menu">
          <label className="node-reference-search"><Search size={13} /><input value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder="搜索当前连接素材" /></label>
          <div className="node-tool-section-label">当前连接素材</div>
          <div className="node-reference-list">
            {visibleReferenceItems.map((item) => (
              <button
                key={`${item.token}-${item.typedToken}`}
                type="button"
                title={`插入 ${item.token}，也可输入 ${item.typedToken}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(item.token)}
              >
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Library size={16} />}
                <span>
                  <b>{item.label}</b>
                  <small>{item.name ? `${item.typedToken} · ${item.name}` : item.typedToken}</small>
                </span>
              </button>
            ))}
            {!referenceItems.length && <div className="node-reference-empty">先把素材连接到当前生成节点，再用 @ 精确引用。</div>}
            {referenceItems.length > 0 && !visibleReferenceItems.length && <div className="node-reference-empty">没有匹配的连接素材。</div>}
          </div>
          {showReferenceCommands && (
            <>
              <div className="node-tool-section-label">指令</div>
              <div className="node-command-list">
                {commands.map((item) => {
                  const Icon = item.icon;
                  return <button key={item.label} type="button" onClick={() => { onInsert(item.value); onClose(); }}><Icon size={14} />{item.label}<SlidersHorizontal size={12} /></button>;
                })}
              </div>
            </>
          )}
          <button type="button" className="node-open-library" onClick={() => { window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "assets" })); onClose(); }}><Library size={14} />打开素材库</button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {values.map((value) => <button key={value} type="button" onClick={() => { onInsert(value); onClose(); }}>{value}</button>)}
          {tool === "characters" && <button type="button" className="col-span-2" onClick={() => { window.dispatchEvent(new CustomEvent("studio:open-drawer", { detail: "assets" })); onClose(); }}><Library size={14} />从素材库选择</button>}
        </div>
      )}
    </div>
  );
}
