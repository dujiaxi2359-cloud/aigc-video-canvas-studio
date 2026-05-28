import { Button } from "../common/Button";

export function FirstRunGuideModal({ onSettings, onClose }: { onSettings: () => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[460px] rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">欢迎使用 AIGC Video Canvas Studio</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          请先前往「设置中心」配置你的模型 API。你可以只配置自己已有的 API，不需要全部配置。
          API Key 会加密保存在后端数据库中，不会出现在画布节点里。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            稍后再说
          </Button>
          <Button onClick={onSettings}>去配置模型</Button>
        </div>
      </div>
    </div>
  );
}
