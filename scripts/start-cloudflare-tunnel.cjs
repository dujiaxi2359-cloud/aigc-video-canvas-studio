const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const protocolArgIndex = process.argv.indexOf("--protocol");
const protocol = protocolArgIndex >= 0 ? process.argv[protocolArgIndex + 1] : "http2";
const targetUrl = process.env.TUNNEL_TARGET_URL || "http://127.0.0.1:4000";

function candidateExecutables() {
  const candidates = ["cloudflared"];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(
      process.env.LOCALAPPDATA,
      "Microsoft",
      "WinGet",
      "Packages",
      "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "cloudflared.exe"
    ));
  }
  return candidates;
}

function updateEnv(publicUrl) {
  const updates = {
    BACKEND_PUBLIC_BASE_URL: publicUrl,
    PUBLIC_UPLOADS_BASE_URL: `${publicUrl.replace(/\/$/, "")}/uploads`
  };
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }
  fs.writeFileSync(envPath, nextLines.join("\n"), "utf8");
}

function start() {
  const args = ["tunnel", "--protocol", protocol, "--url", targetUrl];
  let child;
  let lastError;
  for (const exe of candidateExecutables()) {
    try {
      child = spawn(exe, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!child) {
    console.error("cloudflared 未找到。请先运行：winget install --id Cloudflare.cloudflared -e");
    if (lastError) console.error(lastError.message);
    process.exit(1);
  }

  console.log(`[cloudflare-tunnel] target: ${targetUrl}`);
  console.log(`[cloudflare-tunnel] protocol: ${protocol}`);
  console.log("[cloudflare-tunnel] keep this terminal open while using the public URL.");

  const handleOutput = (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      updateEnv(match[0]);
      console.log(`\n[cloudflare-tunnel] public URL: ${match[0]}`);
      console.log("[cloudflare-tunnel] .env updated. Restart the backend so BACKEND_PUBLIC_BASE_URL takes effect.\n");
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);
  child.on("exit", (code) => process.exit(code ?? 0));
}

start();
