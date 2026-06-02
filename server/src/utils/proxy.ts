import net from "node:net";
import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export type ProxyInfo = {
  usingProxy: boolean;
  mode?: ProxyMode;
  activeMode?: Exclude<ProxyMode, "auto">;
  proxyUrl?: string;
  proxyUrlMasked?: string;
  noProxy?: string;
  message?: string;
};

export type ProxyMode = "off" | "env" | "manual" | "auto";

export type ProxyConfig = {
  mode: ProxyMode;
  proxyUrl?: string;
  noProxy?: string;
};

let runtimeProxyConfig: ProxyConfig = {
  mode: (process.env.PROXY_MODE as ProxyMode | undefined) ?? "auto",
  proxyUrl: process.env.MANUAL_PROXY_URL,
  noProxy: process.env.NO_PROXY || process.env.no_proxy || "localhost,127.0.0.1"
};

let currentProxyInfo: ProxyInfo = { usingProxy: false, mode: runtimeProxyConfig.mode };

function maskProxyUrl(proxyUrl: string) {
  return proxyUrl.replace(/\/\/([^/@]+)@/, "//***@");
}

export function getProxyInfo() {
  return currentProxyInfo;
}

export function getProxyConfig() {
  return runtimeProxyConfig;
}

export function getProxyEnvironmentInfo() {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "";
  return {
    httpProxyMasked: process.env.HTTP_PROXY ? maskProxyUrl(process.env.HTTP_PROXY) : undefined,
    httpsProxyMasked: process.env.HTTPS_PROXY ? maskProxyUrl(process.env.HTTPS_PROXY) : undefined,
    allProxyMasked: process.env.ALL_PROXY ? maskProxyUrl(process.env.ALL_PROXY) : undefined,
    hasEnvProxy: Boolean(envProxy)
  };
}

function resolveProxy(config: ProxyConfig) {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  const noProxy = config.noProxy || process.env.NO_PROXY || process.env.no_proxy || "localhost,127.0.0.1";
  if (config.mode === "off") return { activeMode: "off" as const, proxyUrl: "", noProxy };
  if (config.mode === "manual") return { activeMode: "manual" as const, proxyUrl: config.proxyUrl || "", noProxy };
  if (config.mode === "env") return { activeMode: "env" as const, proxyUrl: envProxy || "", noProxy };
  if (config.proxyUrl) return { activeMode: "manual" as const, proxyUrl: config.proxyUrl, noProxy };
  if (envProxy) return { activeMode: "env" as const, proxyUrl: envProxy, noProxy };
  return { activeMode: "off" as const, proxyUrl: "", noProxy };
}

const commonHttpProxyPorts = [17891, 7890, 7897, 7899, 10809, 10808, 8080, 7078];

function canConnect(host: string, port: number, timeoutMs = 260) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function detectLocalHttpProxy() {
  for (const port of commonHttpProxyPorts) {
    if (await canConnect("127.0.0.1", port)) return `http://127.0.0.1:${port}`;
  }
  return "";
}

export function applyProxyConfig(config: ProxyConfig) {
  runtimeProxyConfig = {
    mode: config.mode,
    proxyUrl: config.proxyUrl?.trim(),
    noProxy: config.noProxy?.trim() || "localhost,127.0.0.1"
  };

  const { activeMode, proxyUrl, noProxy } = resolveProxy(runtimeProxyConfig);
  if (!proxyUrl) {
    setGlobalDispatcher(new Agent());
    currentProxyInfo = {
      usingProxy: false,
      mode: runtimeProxyConfig.mode,
      activeMode,
      noProxy,
      message: activeMode === "off" ? "TUN/直连模式：后端不显式设置代理，由系统路由或 VPN TUN 接管。" : "未找到可用代理配置。"
    };
    console.log("[proxy] proxy disabled", { mode: runtimeProxyConfig.mode, activeMode, noProxy });
    return currentProxyInfo;
  }

  if (!/^https?:\/\//i.test(proxyUrl)) {
    setGlobalDispatcher(new Agent());
    currentProxyInfo = {
      usingProxy: false,
      mode: runtimeProxyConfig.mode,
      activeMode,
      proxyUrl,
      noProxy,
      message: "当前仅支持 http:// 或 https:// 代理地址。"
    };
    console.warn("[proxy] unsupported proxy protocol", { proxyUrl: maskProxyUrl(proxyUrl) });
    return currentProxyInfo;
  }

  process.env.NO_PROXY = noProxy;
  process.env.no_proxy = noProxy;

  setGlobalDispatcher(
    new EnvHttpProxyAgent({
      httpProxy: proxyUrl,
      httpsProxy: proxyUrl,
      noProxy
    })
  );

  currentProxyInfo = {
    usingProxy: true,
    mode: runtimeProxyConfig.mode,
    activeMode,
    proxyUrl,
    proxyUrlMasked: maskProxyUrl(proxyUrl),
    noProxy
  };

  console.log("[proxy] global proxy enabled", {
    proxyUrl: currentProxyInfo.proxyUrlMasked,
    noProxy
  });

  return currentProxyInfo;
}

export async function applySmartProxyConfig(config: ProxyConfig = runtimeProxyConfig) {
  if (config.mode !== "auto") return applyProxyConfig(config);

  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  const detectedProxy = config.proxyUrl || envProxy || (await detectLocalHttpProxy());
  const info = applyProxyConfig({
    ...config,
    mode: detectedProxy ? "manual" : "off",
    proxyUrl: detectedProxy || undefined
  });

  currentProxyInfo = {
    ...info,
    mode: "auto",
    message: detectedProxy
      ? "智能模式：已自动识别本地代理端口。"
      : "智能模式：未发现本地 HTTP 代理，已切换为直连 / TUN。"
  };
  runtimeProxyConfig = { ...config, mode: "auto", proxyUrl: config.proxyUrl, noProxy: config.noProxy };
  return currentProxyInfo;
}

export function setupGlobalProxy() {
  const { proxyUrl } = resolveProxy(runtimeProxyConfig);
  if (runtimeProxyConfig.mode === "auto" && !proxyUrl) {
    currentProxyInfo = {
      usingProxy: false,
      mode: "auto",
      activeMode: "off",
      noProxy: runtimeProxyConfig.noProxy,
      message: "智能模式：启动时先使用直连 / TUN，网络诊断时会自动识别本地代理。"
    };
    setGlobalDispatcher(new Agent());
    console.log("[proxy] smart proxy pending auto detection");
    return currentProxyInfo;
  }
  return applyProxyConfig(runtimeProxyConfig);
}

export async function withTemporaryDirectNetwork<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const previousConfig = { ...runtimeProxyConfig };
  console.warn("[proxy] temporary direct fallback", { label, previousMode: previousConfig.mode });
  setGlobalDispatcher(new Agent());
  currentProxyInfo = {
    usingProxy: false,
    mode: previousConfig.mode,
    activeMode: "off",
    noProxy: previousConfig.noProxy,
    message: "临时直连重试：当前请求绕过本地 HTTP 代理，交给 TUN / 系统路由处理。"
  };

  try {
    return await fn();
  } finally {
    await applySmartProxyConfig(previousConfig);
  }
}
