const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serverDir = path.join(root, "server");
const node = process.execPath;
const out = fs.openSync(path.join(root, "server-detached.out.log"), "a");
const err = fs.openSync(path.join(root, "server-detached.err.log"), "a");
const child = spawn(node, ["dist/index.js"], {
  cwd: serverDir,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true
});

child.unref();
console.log(child.pid);
