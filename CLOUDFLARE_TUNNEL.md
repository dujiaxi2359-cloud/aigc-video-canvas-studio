# Cloudflare Tunnel 公网素材通道

这个方案用于替代 OSS 临时上传：把本地后端 `4000` 暴露成一个 HTTPS 公网地址，让阿里 Wan / DashScope 可以读取 `/uploads/...` 里的本地素材。

## 适合当前阶段

- 不买服务器
- 不用 OSS
- 不开放路由器端口
- 同事也可以通过公网地址临时访问
- 适合本地开发和小范围试用

注意：`trycloudflare.com` 快速隧道是临时地址，每次重启可能会变化。正式长期使用可以后续配置 Cloudflare 账号里的 Named Tunnel 和固定域名。

## 1. 安装 cloudflared

Windows:

```powershell
winget install --id Cloudflare.cloudflared -e
```

## 2. 启动后端

先启动本项目后端，确保本机可访问：

```text
http://127.0.0.1:4000/api/health
```

## 3. 启动 Tunnel

推荐用 HTTP/2，兼容公司网络和 VPN 环境：

```powershell
npm run tunnel:http2
```

脚本会输出类似：

```text
https://xxxx-yyyy-zzzz.trycloudflare.com
```

并自动写入 `.env`：

```env
BACKEND_PUBLIC_BASE_URL=https://xxxx-yyyy-zzzz.trycloudflare.com
PUBLIC_UPLOADS_BASE_URL=https://xxxx-yyyy-zzzz.trycloudflare.com/uploads
```

## 4. 重启后端

Tunnel 地址写入 `.env` 后，需要重启后端，让 `BACKEND_PUBLIC_BASE_URL` 生效。

之后后端生成给阿里的视频素材 URL 会变成：

```text
https://xxxx-yyyy-zzzz.trycloudflare.com/uploads/...
```

这样 DashScope 就能读取素材，不再需要 OSS。

## 5. 当前已知限制

1. 快速隧道地址会变。
2. 终端 / 后台进程关闭后，公网地址失效。
3. 正式给团队长期使用时，建议改成 Cloudflare Named Tunnel + 固定域名。

## 6. 常见问题

### 阿里还是提示需要公网 URL

检查：

```text
GET /api/system/share-info
```

确认 `backendUrl` 是 `https://*.trycloudflare.com`。

### 生成时仍然走 OSS

确认 `.env` 里已有：

```env
BACKEND_PUBLIC_BASE_URL=https://你的-cloudflare-url
```

然后重启后端。

### Tunnel 连不上

尝试：

```powershell
npm run tunnel:http2
```

如果仍不稳定，检查 VPN / 代理是否拦截 Cloudflare 连接。
