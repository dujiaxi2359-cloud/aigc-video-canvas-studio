# 公司内网共享部署

本阶段只做公司 WiFi / 局域网共享：项目仍然跑在你的电脑上，同事通过你的电脑内网 IP 访问。API Key 只在后端保存，不会暴露到同事浏览器。

## 1. 查看你的内网 IP

在 Windows CMD 或 PowerShell 输入：

```powershell
ipconfig
```

找到当前 WiFi / 以太网网卡里的 `IPv4 地址`，例如：

```text
192.168.1.88
```

下面示例都用 `192.168.1.88`，你需要替换成自己的实际 IP。

## 2. 配置环境变量

在项目根目录创建或修改 `.env`：

```env
HOST=0.0.0.0
PORT=4000

VITE_API_BASE_URL=http://192.168.1.88:4000
BACKEND_PUBLIC_BASE_URL=http://192.168.1.88:4000
FRONTEND_ORIGIN=http://192.168.1.88:3001

UPLOAD_DIR=./uploads
PUBLIC_UPLOADS_BASE_URL=http://192.168.1.88:4000/uploads
```

真实模型 Key 仍然只放后端 `.env` 或后端模型配置中心，不要写进前端代码。

## 3. 启动开发服务

安装依赖后启动：

```powershell
npm install
npm run dev
```

前端默认监听：

```text
http://0.0.0.0:3001
```

后端默认监听：

```text
http://0.0.0.0:4000
```

同事访问：

```text
http://192.168.1.88:3001
```

你也可以在设置中心的“网络 / 代理诊断”里点击“复制内网访问地址”。

## 4. Windows 防火墙

如果同事打不开页面，优先检查 Windows 防火墙：

1. 第一次启动 Node.js 时，选择允许访问“专用网络”。
2. Windows 安全中心 -> 防火墙和网络保护 -> 允许应用通过防火墙。
3. 确认 Node.js 允许专用网络访问。

## 5. 常见问题

### 页面能打开，但接口失败

检查 `.env` 中：

```env
VITE_API_BASE_URL=http://你的内网IP:4000
```

不要写成：

```env
VITE_API_BASE_URL=http://127.0.0.1:4000
```

否则同事浏览器会请求他自己电脑的 127.0.0.1。

### 素材不显示

确认后端静态资源可以访问：

```text
http://你的内网IP:4000/uploads
```

素材库和生成结果应该通过后端 URL 展示，不要使用本机磁盘路径。

### 视频无法下载

下载必须走后端接口：

```text
GET /api/assets/:assetId/download
```

不要让前端直接下载 `C:\...` 这种本地路径。

### 后端没读到 .env

确认 `.env` 放在项目根目录，并在修改后重启后端服务。

### 公司网络访问不到

确认你和同事在同一个 WiFi / 内网；如果公司网络启用了客户端隔离，需要让网管关闭同一 WiFi 下的设备隔离，或改用公司内网服务器部署。

## 6. 权限预留

当前阶段默认用户可以先使用：

```text
default-user
default-project
```

代码里已预留 `ownerUserId`、`sharedWithUserIds` 等字段，后续云端部署时再接登录、团队权限和项目协作。
