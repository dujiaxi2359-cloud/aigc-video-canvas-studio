import { useEffect, useState } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Select } from "../common/Select";
import { diagnosticsApi, type NetworkDiagnosticResult, type OssHealthResult, type ProxySettingsResult } from "../../services/diagnosticsApi";

const providers = [
  { id: "google", label: "Google" },
  { id: "azure-openai", label: "Azure OpenAI" },
  { id: "alibaba", label: "DashScope / 阿里" },
  { id: "openai", label: "OpenAI" },
  { id: "grok", label: "xAI / Grok" },
  { id: "kling", label: "Kling" },
  { id: "seedance", label: "Seedance" }
];

export function NetworkDiagnosticsPanel() {
  const [providerId, setProviderId] = useState("google");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testingOss, setTestingOss] = useState(false);
  const [result, setResult] = useState<NetworkDiagnosticResult | null>(null);
  const [ossResult, setOssResult] = useState<OssHealthResult | null>(null);
  const [proxySettings, setProxySettings] = useState<ProxySettingsResult | null>(null);

  useEffect(() => {
    diagnosticsApi
      .proxy()
      .then((settings) => {
        setProxySettings(settings);
        if (settings.config.mode !== "auto") {
          void diagnosticsApi.setProxy({ mode: "auto" }).then(setProxySettings).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);

  async function testNetwork() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await diagnosticsApi.network({ providerId, apiBaseUrl: apiBaseUrl || undefined }));
    } catch (error) {
      setResult({
        ok: false,
        providerId,
        usingProxy: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: error instanceof Error ? error.message : "网络诊断失败"
      });
    } finally {
      setTesting(false);
    }
  }

  async function testOss() {
    setTestingOss(true);
    setOssResult(null);
    try {
      setOssResult(await diagnosticsApi.ossHealth());
    } catch (error) {
      setOssResult({
        ok: false,
        code: "OSS_HEALTH_FAILED",
        message: error instanceof Error ? error.message : "OSS 检测失败"
      });
    } finally {
      setTestingOss(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/[0.08] bg-[#151922]/[0.82] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-[#f3f5f7]">网络 / 代理诊断</div>
          <div className="mt-1 text-[12px] text-[#7d8796]">测试请求从后端 Node 服务发出，用于确认 VPN / 代理是否被后端使用。</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={testingOss} onClick={testOss}>
            {testingOss ? "检测中..." : "测试 OSS 连接"}
          </Button>
          <Button variant="primary" disabled={testing} onClick={testNetwork}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-white/[0.06] bg-black/[0.14] p-3">
        <div className="text-[13px] font-semibold text-[#f3f5f7]">智能网络模式</div>
        <div className="mt-1 text-[12px] leading-5 text-[#7d8796]">
          系统会自动识别本地 VPN 代理端口；识别不到代理时，会自动按 TUN / 系统路由直连处理。
        </div>
        {proxySettings && (
          <div className="mt-2 text-[12px] leading-5 text-[#a2acba]">
            当前：{proxySettings.info.usingProxy ? "已自动使用本地代理" : "正在使用 TUN / 系统直连"}
            {proxySettings.info.proxyUrlMasked ? ` · ${proxySettings.info.proxyUrlMasked}` : ""}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-3">
        <Select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </Select>
        <Input
          value={apiBaseUrl}
          onChange={(event) => setApiBaseUrl(event.target.value)}
          placeholder="可选：Azure / Kling / Seedance 可填写完整 endpoint 或资源根地址"
        />
      </div>

      {ossResult && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[12px] ${ossResult.ok ? "border-emerald-300/[0.14] bg-emerald-400/[0.07] text-emerald-100" : "border-red-300/[0.16] bg-red-400/[0.08] text-red-100"}`}>
          <div>{ossResult.ok ? "OSS 连接正常，可以上传本地素材。" : ossResult.message || "OSS 检测失败"}</div>
          <div className="mt-1 text-[#a2acba]">
            bucket: {ossResult.bucket || "-"} · region: {ossResult.region || "-"} · endpoint: {ossResult.endpoint || "-"}
          </div>
          {!ossResult.ok && ossResult.suggestion && <div className="mt-1 text-red-100/80">{ossResult.suggestion}</div>}
        </div>
      )}

      {result && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[12px] ${result.ok ? "border-emerald-300/[0.14] bg-emerald-400/[0.07] text-emerald-100" : "border-red-300/[0.16] bg-red-400/[0.08] text-red-100"}`}>
          <div>{result.ok ? "连接可达" : result.errorMessage || "连接失败"}</div>
          <div className="mt-1 text-[#a2acba]">
            endpoint: {result.endpoint || "-"} · proxy: {result.usingProxy ? result.proxyUrlMasked || "enabled" : "off / TUN"} · latency: {result.latencyMs ?? "-"}ms · status: {result.statusCode ?? "-"}
          </div>
        </div>
      )}
    </div>
  );
}
