import { api } from "./api";

export type NetworkDiagnosticResult = {
  ok: boolean;
  providerId?: string;
  endpoint?: string;
  usingProxy: boolean;
  proxyUrlMasked?: string;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  debugMessage?: string;
};

export type OssHealthResult = {
  ok: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
  canPutObject?: boolean;
  canGetSignedUrl?: boolean;
  code?: string;
  message?: string;
  suggestion?: string;
  debugMessage?: string;
};

export type SystemNetworkHealthResult = {
  ok: boolean;
  latencyMs: number;
  usingProxy: boolean;
  proxyUrlMasked?: string;
  ossEndpoint: string;
  ossReachable: boolean;
  dashscopeReachable: boolean;
  googleReachable: boolean;
};

export type ShareInfoResult = {
  ok: boolean;
  localIp: string;
  frontendUrl: string;
  backendUrl: string;
  uploadsUrl: string;
};

export type ProxyMode = "off" | "env" | "manual" | "auto";

export type ProxySettingsResult = {
  status?: "success";
  config: {
    mode: ProxyMode;
    proxyUrl?: string;
    noProxy?: string;
  };
  info: {
    usingProxy: boolean;
    mode?: ProxyMode;
    activeMode?: Exclude<ProxyMode, "auto">;
    proxyUrlMasked?: string;
    noProxy?: string;
    message?: string;
  };
  environment: {
    hasEnvProxy: boolean;
    httpProxyMasked?: string;
    httpsProxyMasked?: string;
    allProxyMasked?: string;
  };
};

export const diagnosticsApi = {
  proxy: () => api.get<ProxySettingsResult>("/api/diagnostics/proxy"),
  setProxy: (data: { mode: ProxyMode; proxyUrl?: string; noProxy?: string }) =>
    api.post<ProxySettingsResult>("/api/diagnostics/proxy", data),
  network: (data: { providerId: string; apiBaseUrl?: string }) =>
    api.post<NetworkDiagnosticResult>("/api/diagnostics/network", data),
  ossHealth: () => api.get<OssHealthResult>("/api/system/oss/health"),
  systemNetworkHealth: () => api.get<SystemNetworkHealthResult>("/api/system/network/health"),
  shareInfo: () => api.get<ShareInfoResult>("/api/system/share-info")
};
