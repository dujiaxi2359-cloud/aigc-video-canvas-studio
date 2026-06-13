const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const logDir = path.join(root, "logs");
const logPath = path.join(logDir, "server-keepalive.log");
const nodePath = process.execPath;

fs.mkdirSync(logDir, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line);
}

function startServer() {
  log("Starting Next.js LAN server on port 3000.");

  const child = spawn(nodePath, [path.join(root, "scripts", "start-lan.js")], {
    cwd: root,
    env: { ...process.env, PORT: process.env.PORT || "3000", HOSTNAME: "0.0.0.0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => log(chunk.toString().trimEnd()));
  child.stderr.on("data", (chunk) => log(chunk.toString().trimEnd()));

  child.on("exit", (code, signal) => {
    log(`Server exited with code=${code ?? ""} signal=${signal ?? ""}. Restarting in 2s.`);
    setTimeout(startServer, 2000);
  });
}

process.on("uncaughtException", (error) => log(`Keep-alive uncaught exception: ${error.stack || error.message}`));
process.on("unhandledRejection", (error) => log(`Keep-alive unhandled rejection: ${error?.stack || error}`));

startServer();
