import { ArrowLeft, Blocks, CircleDollarSign, Trophy, UsersRound, Video } from "lucide-react";
import type { Page } from "../App";
import { HomeTopNav } from "../components/home/HomeTopNav";

const pageInfo: Record<string, { title: string; copy: string; icon: typeof Video }> = {
  templates: { title: "模板中心", copy: "模板也可以直接从画布左侧抽屉插入。", icon: Blocks },
  community: { title: "视频社区", copy: "这里将汇集团队作品、案例和可复用工作流。", icon: Video },
  arena: { title: "模型竞技场", copy: "用于并排比较不同模型的画面与运动表现。", icon: Trophy },
  pricing: { title: "价格方案", copy: "团队用量、积分与套餐管理将在这里呈现。", icon: CircleDollarSign },
  account: { title: "账号与团队", copy: "管理成员、协作权限和个人偏好。", icon: UsersRound }
};

export function PlaceholderPage({ page, onNavigate }: { page: Page; onNavigate: (page: Page, projectId?: string) => void }) {
  const info = pageInfo[page] ?? pageInfo.community;
  const Icon = info.icon;
  return (
    <div className="studio-page min-h-full">
      <HomeTopNav page={page} onNavigate={onNavigate} />
      <div className="grid min-h-screen place-items-center px-6 pt-16">
        <div className="max-w-lg text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.05] text-white/72"><Icon size={24} /></span>
          <h1 className="mt-5 text-3xl font-semibold">{info.title}</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/42">{info.copy}</p>
          <button type="button" onClick={() => onNavigate("home")} className="studio-secondary-button mx-auto mt-6"><ArrowLeft size={15} /> 返回首页</button>
        </div>
      </div>
    </div>
  );
}
