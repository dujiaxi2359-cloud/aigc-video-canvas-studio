# FIX_CONTEXT

## 当前项目

- 项目路径：`C:\Users\CXB\Documents\Codex\2026-05-08\0-ai-web-next-js-app`
- GitHub 仓库：`https://github.com/dujiaxi2359-cloud/ecommerce-ai-workflow.git`
- 项目类型：Next.js App Router + TypeScript + Tailwind CSS 电商 AI 生图工作流。

## 还没完全修好的问题

- 客户自带 API Key 的生图链路还需要继续验证，重点是 OpenAI 官方、OpenAI 兼容代理、Azure OpenAI 三种配置都能正常生成图片。
- 当前本地改动把默认 API provider 改成 `openai`，允许官方 OpenAI 模式不填写 `OPENAI_BASE_URL`，并在接口成功但没有返回图片时给出更明确提示。
- Azure OpenAI 适配从 SDK 的 `AzureOpenAI` 改成使用 `OpenAI` client + Azure deployment baseURL/defaultQuery/defaultHeaders，仍建议用真实 Azure Endpoint、Deployment 和 API Key 复测。

## 涉及文件

- `app/page.tsx`
  - 默认 provider 从 Azure 改为 OpenAI。
  - OpenAI 模式不再强制填写 Base URL。
  - 生图接口返回空图片数组时提示用户检查模型和代理返回值。
- `lib/apiKey/openaiClientFromRequest.ts`
  - 规范化 OpenAI 兼容 Base URL。
  - 解析 Azure Endpoint、Deployment 和 API Version。
  - 创建 OpenAI/Azure 请求客户端并做 API Key 脱敏。
- `.gitignore`
  - 确保不提交 `node_modules`、`.env`、`.env.local`、`.next`、`dist`、`build`、`.cache`、日志文件等本地产物。

## 启动命令

```bash
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

如果使用仓库自带 Windows 便携 Node：

```powershell
.tools\node-v24.14.0-win-x64\npm.cmd install
.tools\node-v24.14.0-win-x64\npm.cmd run dev
```

## 本次校验记录

- `npm run lint`：当前 Windows PATH 没有全局 `npm`；改用便携 npm 后，脚本调用本地 shim 返回 `Access is denied.`。
- `.tools\node-v24.14.0-win-x64\node.exe node_modules\eslint\bin\eslint.js .`：ESLint 9 报 `TypeError: Converting circular structure to JSON`，看起来与当前 ESLint/Next 配置兼容性有关。
- `npm run build`：本地 shim 返回 `Access is denied.`；改用便携 node 直接执行 Next build 后，Turbopack 在处理 `app/globals.css` 时因 `spawning node pooled process` 被拒绝访问（Windows os error 5）失败。

## 新电脑继续修复提示词

```text
请接着修复这个电商 AI 生图工作流项目。先阅读 FIX_CONTEXT.md、README.md、app/page.tsx、lib/apiKey/openaiClientFromRequest.ts 和 lib/image-generation.ts。不要重构项目，不要删除已有功能。重点验证并修复客户自带 API Key 下 OpenAI 官方、OpenAI 兼容代理、Azure OpenAI 的图片生成链路，确保 Base URL/Endpoint/Deployment/API Version 配置正确，接口成功但没有图片时要给清晰中文错误。修复后运行 npm run lint 和 npm run build，并告诉我改了哪些文件、如何启动、还剩哪些风险。
```
