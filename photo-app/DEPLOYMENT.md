# 部署说明

## 方式一：局域网共享

适合临时给同事在同一网络下访问。

```bash
npm run build
npm run start:lan
```

同事访问：

```text
http://你的电脑IP:3000
```

注意：你的电脑需要保持开机，Windows 防火墙需要允许 3000 端口。

## 方式二：Vercel

1. 把项目上传到 GitHub。
2. 在 Vercel 新建项目，导入该仓库。
3. 在 Vercel 项目设置里添加环境变量：

```bash
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=你的 Azure Key
OPENAI_API_VERSION=2025-04-01-preview
DEPLOYMENT_NAME=gpt-image-2
OPENAI_IMAGE_MODEL=gpt-image-2
```

4. 部署完成后，把 Vercel 域名发给同事。

不要上传 `.env.local`。

## 方式三：Docker / 云服务器

构建镜像：

```bash
docker build -t ecommerce-ai-workflow .
```

启动：

```bash
docker run -p 3000:3000 \
  -e AZURE_OPENAI_ENDPOINT="https://your-resource.cognitiveservices.azure.com/" \
  -e AZURE_OPENAI_API_KEY="你的 Azure Key" \
  -e OPENAI_API_VERSION="2025-04-01-preview" \
  -e DEPLOYMENT_NAME="gpt-image-2" \
  ecommerce-ai-workflow
```

## 宝塔 / Nginx 反向代理超时

图片生成可能超过宝塔默认的 Nginx 代理等待时间。如果页面提示 `504 Gateway Time-out nginx`，在宝塔面板进入：

```text
网站 -> 当前站点 -> 配置文件
```

确认反向代理到 Next.js 的 `location /` 内包含：

```nginx
client_max_body_size 80m;
proxy_connect_timeout 600;
proxy_send_timeout 600;
proxy_read_timeout 600;
```

保存后在宝塔里重载 Nginx。临时规避可以把生成数量设为 1，质量设为 low 或 medium。

## 安全提醒

- `.env.local` 只用于本地，不要发给同事。
- API Key 必须放在服务器环境变量里。
- 如果已经把 Key 发到聊天或文档里，建议在 Azure Portal 里轮换一次 Key。
