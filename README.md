# AIGC Video Canvas Studio

本项目是本地 Web 版 AIGC 视频工作流画布 MVP。它不是 Electron、桌面端或 App。

## 启动

```bash
npm install
npm run dev
```

- 前端: http://localhost:3000
- 后端: http://localhost:4000

## BYOK 规则

- API Key 只在设置中心填写。
- API Key 使用后端 `APP_SECRET` 加密保存到 SQLite。
- 画布节点、项目数据、历史记录都不保存 API Key 或 API Base URL。
- 视频节点只保存 `modelConfigId`，并只展示已启用的视频模型。

第一版只做 mock 生成，不调用真实模型接口。
