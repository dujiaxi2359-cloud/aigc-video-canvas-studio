export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type RequestOptions = RequestInit & { params?: Record<string, string | undefined> };

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(apiUrl(path), window.location.origin);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(window.localStorage.getItem("aigcnong-active-workspace") ? { "X-Workspace-Id": window.localStorage.getItem("aigcnong-active-workspace")! } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error(`网络请求失败，请检查后端服务是否启动、接口地址是否可访问。当前后端地址：${API_BASE_URL || window.location.origin}`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ errorMessage: response.statusText, error: response.statusText }));
    const message = error.errorMessage ?? error.message ?? error.error ?? response.statusText;
    const requestError = new Error(message) as Error & { status?: number; errorCode?: string };
    requestError.status = response.status;
    requestError.errorCode = error.errorCode;
    if (response.status === 401) window.dispatchEvent(new CustomEvent("auth:required"));
    throw requestError;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" })
};
