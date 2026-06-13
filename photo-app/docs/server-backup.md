# 电商 AI 生图工作流服务器备份

这份文件用于以后换服务器、恢复部署、排查线上服务。

## 当前线上地址

```text
http://119.91.248.47
```

## Git 仓库

```text
https://github.com/dujiaxi2359-cloud/ecommerce-ai-workflow
```

## 服务器目录

```text
/www/wwwroot/ecommerce-ai-workflow
```

## 需要保留但不要上传 Git 的文件

```text
/www/wwwroot/ecommerce-ai-workflow/.env.local
```

`.env.local` 用于保存服务器环境变量。不要提交到 GitHub。

## .env.local 模板

```env
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_OPENAI_API_VERSION=2025-04-01-preview
AZURE_OPENAI_DEPLOYMENT=gpt-image-2

# 如果使用平台自己的 OpenAI Key，可以配置：
OPENAI_API_KEY=
OPENAI_BASE_URL=

# 客户体验授权码，格式：code:plan:expiresAt
# 示例：AIGC-CLIENT-EXAMPLE-2026:pro:2026-06-18
COMMERCE_AI_LICENSE_CODES=
```

## PM2 进程名

```text
ecommerce-ai-workflow
```

## Nginx 反向代理配置

文件位置：

```text
/www/server/panel/vhost/nginx/ecommerce-ai-workflow.conf
```

内容：

```nginx
server {
    listen 80;
    server_name 119.91.248.47;

    client_max_body_size 80m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
    }
}
```

## 腾讯云防火墙

需要放行：

```text
TCP 80    来源：全部 IPv4 地址
TCP 8888  来源：全部 IPv4 地址，用于宝塔面板
TCP 22    来源：全部 IPv4 地址，用于 SSH
```

如需直接访问 Node 端口，可临时放行：

```text
TCP 3000  来源：全部 IPv4 地址
```

## 更新部署命令

推荐直接执行仓库脚本：

```bash
cd /www/wwwroot/ecommerce-ai-workflow && bash scripts/server-deploy.sh
```

如果 GitHub 直连不稳定，可以先把 origin 临时切到镜像：

```bash
cd /www/wwwroot/ecommerce-ai-workflow && \
git remote set-url origin https://gh.llkk.cc/https://github.com/dujiaxi2359-cloud/ecommerce-ai-workflow.git && \
bash scripts/server-deploy.sh
```

手动部署命令：

```bash
cd /www/wwwroot/ecommerce-ai-workflow && \
git fetch origin main && \
git reset --hard origin/main && \
rm -rf .next && \
npm install --registry=https://registry.npmmirror.com --no-audit --loglevel=warn && \
npm run build && \
test -f .next/standalone/server.js && \
rm -rf .next/standalone/.next/static && \
mkdir -p .next/standalone/.next && \
cp -r .next/static .next/standalone/.next/static && \
if [ -d public ]; then cp -r public .next/standalone/public; fi && \
set -a && . ./.env.local && set +a && \
pm2 delete ecommerce-ai-workflow || true && \
PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js --name ecommerce-ai-workflow && \
pm2 save && \
curl -f http://127.0.0.1:3000 && \
/www/server/nginx/sbin/nginx -t && \
/www/server/nginx/sbin/nginx -s reload && \
pm2 status
```

## 健康检查

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
pm2 logs ecommerce-ai-workflow --lines 40
```

如果页面出现 `502 Bad Gateway`，优先重新用明确端口启动：

```bash
pm2 delete ecommerce-ai-workflow || true && \
cd /www/wwwroot/ecommerce-ai-workflow && \
set -a && . ./.env.local && set +a && \
PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js --name ecommerce-ai-workflow && \
pm2 save && \
curl -I http://127.0.0.1:3000
```

## 授权码接口检查

```bash
curl -s -X POST http://127.0.0.1:3000/api/license/verify \
  -H "Content-Type: application/json" \
  -d '{"code":"your-admin-code"}'
```

正常结果应包含：

```json
{"valid":true}
```
