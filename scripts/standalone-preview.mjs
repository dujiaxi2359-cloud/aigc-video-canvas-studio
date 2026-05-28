import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(process.cwd());
const dataDir = path.join(root, "server", "data");
const uploadDir = path.join(root, "server", "uploads");
const dbPath = path.join(dataDir, "standalone-preview.json");

fs.mkdirSync(dataDir, { recursive: true });
for (const folder of ["images", "videos", "audios", "scripts", "generated", "exports"]) {
  fs.mkdirSync(path.join(uploadDir, folder), { recursive: true });
}

function readDb() {
  if (!fs.existsSync(dbPath)) return { modelConfigs: [], assets: [], projects: [], history: [] };
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const presets = [
  {
    id: "seedance-2",
    name: "Seedance 2.0",
    provider: "Volcano Engine / Seedance",
    capabilities: {
      duration: { type: "enum", values: [5, 10] },
      aspectRatios: ["16:9", "9:16", "1:1"],
      resolutions: ["720P", "1080P"],
      inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
      supportsSeed: true,
      supportsCameraControl: true,
      supportsWatermark: true
    }
  },
  {
    id: "wan-2-6-t2v",
    name: "Wan 2.6 Text to Video",
    provider: "Alibaba Bailian / Wan",
    capabilities: {
      duration: { type: "range", min: 2, max: 15, step: 1 },
      aspectRatios: ["16:9", "9:16", "1:1"],
      resolutions: ["720P", "1080P"],
      inputModes: ["text-to-video"]
    }
  },
  {
    id: "veo-3x",
    name: "Veo 3.x / 3.1 / Fast / Lite",
    provider: "Google Gemini / Veo",
    capabilities: {
      duration: { type: "enum", values: [4, 6, 8] },
      aspectRatios: ["16:9", "9:16"],
      resolutions: ["720p", "1080p", "4k"],
      inputModes: ["text-to-video", "image-to-video", "reference-to-video"]
    }
  }
];

function durations(capability) {
  if (capability.type === "fixed") return [capability.value];
  if (capability.type === "enum") return capability.values;
  const values = [];
  for (let value = capability.min; value <= capability.max; value += capability.step) values.push(value);
  return values;
}

function mask(apiKey) {
  if (!apiKey) return "";
  return `${apiKey.startsWith("sk-") ? "sk-" : apiKey.slice(0, 3)}************${apiKey.slice(-4)}`;
}

function html() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AIGC Video Canvas Studio</title>
  <style>
    :root{--bg:#070b14;--panel:#0e1524;--card:#151c2b;--line:#293653;--text:#f8fafc;--muted:#93a4bf;--accent:#6d7cff;--cyan:#31d5ff;--green:#72f2a5;--warn:#ffd166}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .app{display:flex;height:100vh;overflow:hidden}.side{width:78px;background:#080d19;border-right:1px solid #1e2b44;padding:16px 10px;display:flex;flex-direction:column;gap:12px}
    .icon{height:44px;border:1px solid #263552;border-radius:8px;display:grid;place-items:center;background:#111827;color:#cbd5e1;cursor:pointer;font-weight:700}.icon.active{background:linear-gradient(135deg,#29357a,#5967f6);color:white}
    main{flex:1;display:flex;flex-direction:column;min-width:0}.top{height:64px;border-bottom:1px solid #1e2b44;background:#0b1020;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
    button{border:1px solid #33425f;background:var(--accent);color:white;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:650}button.ghost{background:#121a2a}button.small{padding:6px 9px;font-size:12px}
    .canvas{position:relative;flex:1;overflow:hidden;background:radial-gradient(circle at 20% 20%,rgba(109,124,255,.11),transparent 27%),radial-gradient(circle at 80% 10%,rgba(49,213,255,.07),transparent 22%),#070b14}
    .canvas:before{content:"";position:absolute;inset:0;background-image:radial-gradient(#243653 1.2px,transparent 1.2px);background-size:22px 22px;opacity:.9}
    .edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edge{fill:none;stroke:var(--accent);stroke-width:2.2;filter:drop-shadow(0 0 7px rgba(109,124,255,.85))}.edge-label{font-size:11px;fill:#c7d2fe}
    .panel{position:absolute;left:22px;top:22px;width:152px;background:rgba(13,20,36,.94);border:1px solid #263653;border-radius:8px;padding:12px;box-shadow:0 16px 40px #0009}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.panel button{padding:8px 0}
    .node{position:absolute;width:322px;background:rgba(21,28,43,.98);border:1px solid rgba(109,124,255,.45);border-radius:8px;box-shadow:0 18px 48px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.02);user-select:none}
    .node.video{width:346px}.node.selected{border-color:var(--cyan);box-shadow:0 0 0 1px rgba(49,213,255,.25),0 18px 48px rgba(0,0,0,.45)}
    .node-head{height:40px;border-bottom:1px solid #293653;display:flex;align-items:center;justify-content:space-between;padding:0 12px;cursor:grab}.node-title{font-size:14px;font-weight:800}.node-type{font-size:11px;color:#a5b4fc;border:1px solid #334679;border-radius:999px;padding:3px 7px;background:#1c2540}
    .node-body{padding:12px}.node textarea,.node input,.node select{width:100%;background:#070b14;border:1px solid #293653;border-radius:6px;color:white;padding:8px;margin-top:8px;outline:none}.node textarea{min-height:70px;resize:vertical}
    .preview{height:132px;border:1px solid #293653;border-radius:7px;background:linear-gradient(135deg,#0a0f1c,#111a2d);display:grid;place-items:center;color:#62708d;margin-bottom:10px}.field-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.muted{color:var(--muted);font-size:13px}.hint{margin-top:8px;color:var(--warn);font-size:12px}.ok{margin-top:8px;color:var(--green);font-size:12px}.danger{color:#ff8a8a;font-size:12px;margin-top:8px}
    .port{position:absolute;width:13px;height:13px;border:2px solid #0a1020;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 3px rgba(49,213,255,.14),0 0 12px rgba(49,213,255,.8);cursor:crosshair;z-index:3}.port.in{left:-7px;top:50%}.port.out{right:-7px;top:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(109,124,255,.16),0 0 12px rgba(109,124,255,.9)}
    .port-label{position:absolute;font-size:10px;color:#7dd3fc;top:calc(50% + 12px)}.port-label.in{left:8px}.port-label.out{right:8px;color:#c4b5fd}
    .page{height:calc(100vh - 64px);overflow:auto;padding:24px;background:#080b13}.card{border:1px solid #263653;background:#151c2b;border-radius:8px;padding:16px;margin:12px 0}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px}.settings-grid input,.settings-grid select{width:100%;background:#070b14;border:1px solid #293653;border-radius:6px;color:white;padding:10px}
    .toolbar{display:flex;gap:8px;align-items:center}.crumb{font-size:12px;color:var(--muted)}.brand{font-weight:850}.empty{border:1px dashed #33425f;border-radius:8px;padding:22px;color:var(--muted);text-align:center}
  </style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="icon active" data-page="canvas" onclick="show('canvas')">+</div>
    <div class="icon" data-page="assets" onclick="show('assets')">素</div>
    <div class="icon" data-page="history" onclick="show('history')">历</div>
    <div class="icon" data-page="settings" onclick="show('settings')">设</div>
  </aside>
  <main>
    <header class="top">
      <div><div class="crumb">当前项目</div><div class="brand">AIGC 视频工作流</div></div>
      <div class="toolbar">
        <button class="ghost" onclick="saveProject()">保存项目</button>
        <button onclick="runSelected()">运行当前节点</button>
        <button class="ghost">导出</button>
      </div>
    </header>
    <section id="canvas" class="canvas">
      <svg id="edges" class="edges"></svg>
      <div class="panel">
        <div class="muted" style="margin-bottom:8px">添加节点</div>
        <div class="grid">
          <button onclick="addNode('text')">文本</button><button onclick="addNode('image')">图片</button>
          <button onclick="addNode('video')">视频</button><button onclick="addNode('audio')">音频</button>
          <button onclick="addNode('script')">脚本</button><button onclick="addNode('compose')">合成</button>
        </div>
      </div>
    </section>
    <section id="settings" class="page" style="display:none">
      <h2>模型配置中心</h2>
      <p class="muted">API Key 只在设置中心填写。画布节点不会出现 API Key 或 API Base URL，只保存 modelConfigId。</p>
      <div class="card">
        <div class="settings-grid">
          <input id="displayName" placeholder="显示名称，例如 Seedance 2.0" />
          <input id="provider" placeholder="服务商，例如 Volcano Engine / Seedance" />
          <input id="apiBaseUrl" placeholder="API Base URL" />
          <input id="apiKey" type="password" placeholder="API Key" />
          <input id="modelName" placeholder="Model Name" />
          <select id="modelType"><option>text-to-video</option><option>image-to-video</option><option>video-to-video</option></select>
          <select id="preset">${presets.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select>
          <label class="muted"><input id="enabled" type="checkbox" checked /> 启用</label>
        </div>
        <div style="margin-top:12px"><button onclick="createModel()">保存模型</button></div>
      </div>
      <div id="models" class="cards"></div>
    </section>
    <section id="assets" class="page" style="display:none"><h2>素材库</h2><div class="empty">预览版保留素材库入口。完整 npm 版支持上传、预览、删除和加载到画布。</div></section>
    <section id="history" class="page" style="display:none"><h2>生成历史</h2><div id="historyList"></div></section>
  </main>
</div>
<script>
let nodes = [];
let edges = [];
let drag = null;
let linking = null;
let selectedNodeId = null;
const labels = { text: "文本节点", image: "图片节点", video: "视频生成", audio: "音频节点", script: "脚本节点", compose: "视频合成" };
const typeNames = { text: "TEXT", image: "IMAGE", video: "VIDEO", audio: "AUDIO", script: "SCRIPT", compose: "COMPOSE" };
const allowed = new Set(["text->video","image->video","video->video","video->compose","audio->compose","text->compose","script->video","script->compose","image->compose"]);

function api(path, opt) {
  return fetch(path, { headers: { "content-type": "application/json" }, ...(opt || {}) }).then((r) => r.json());
}

function show(id) {
  for (const el of document.querySelectorAll("main section")) el.style.display = "none";
  document.getElementById(id).style.display = "block";
  document.querySelectorAll(".icon").forEach((item) => item.classList.toggle("active", item.dataset.page === id));
  refresh();
}

function addNode(type) {
  const id = type + "_" + Date.now();
  const data = { title: labels[type], type, prompt: "", status: "idle" };
  nodes.push({ id, type, x: 190 + nodes.length * 38, y: 155 + nodes.length * 26, data });
  selectedNodeId = id;
  render();
}

function nodeHtml(n) {
  let body = "";
  if (n.type === "text") body = '<textarea placeholder="提示词、口播文案、字幕文本"></textarea><div class="muted">可连接到视频节点或合成节点。</div>';
  if (n.type === "image") body = '<div class="preview">产品图 / 参考图</div><button class="ghost small">上传图片</button><div class="muted" style="margin-top:8px">可连接到视频节点作为图生视频输入。</div>';
  if (n.type === "audio") body = '<div class="preview">音频波形预览</div><button class="ghost small">上传音频</button><div class="muted" style="margin-top:8px">可连接到合成节点。</div>';
  if (n.type === "script") body = '<textarea placeholder="分镜脚本 / shot prompt"></textarea><button class="ghost small">添加分镜</button><button class="ghost small">导出 JSON</button>';
  if (n.type === "compose") body = '<div class="preview">成片预览</div><div class="muted">接收视频、音频、字幕输入。第一版预留 FFmpeg。</div><button onclick="event.stopPropagation();composeNode(\\'' + n.id + '\\')">模拟合成</button><div id="msg_' + n.id + '"></div>';
  if (n.type === "video") body = videoBody(n);
  return '<div class="port in" data-port="in" data-id="' + n.id + '"></div><div class="port out" data-port="out" data-id="' + n.id + '"></div><span class="port-label in">input</span><span class="port-label out">output</span><div class="node-head"><span class="node-title">' + n.data.title + '</span><span class="node-type">' + typeNames[n.type] + '</span></div><div class="node-body">' + body + '<div style="margin-top:12px"><button class="ghost small" onclick="event.stopPropagation();deleteNode(\\'' + n.id + '\\')">删除</button></div></div>';
}

function videoBody(n) {
  setTimeout(() => fillModels(n.id), 0);
  return '<div class="preview" id="preview_' + n.id + '">视频预览</div><div class="muted">视频节点不会出现 API Key / API Base URL</div><textarea id="p_' + n.id + '" placeholder="视频提示词"></textarea><select id="m_' + n.id + '" onchange="loadOptions(\\'' + n.id + '\\')"></select><select id="mode_' + n.id + '"></select><div class="field-row"><select id="ratio_' + n.id + '"></select><select id="res_' + n.id + '"></select><select id="dur_' + n.id + '"></select></div><input id="count_' + n.id + '" type="number" value="1" min="1" max="4" /><div id="msg_' + n.id + '" class="hint"></div><button onclick="event.stopPropagation();generate(\\'' + n.id + '\\')">生成视频</button>';
}

function render() {
  document.querySelectorAll(".node").forEach((item) => item.remove());
  const canvas = document.getElementById("canvas");
  for (const n of nodes) {
    const el = document.createElement("div");
    el.className = "node " + n.type + (selectedNodeId === n.id ? " selected" : "");
    el.dataset.id = n.id;
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    el.innerHTML = nodeHtml(n);
    el.querySelector(".node-head").onpointerdown = (event) => {
      selectedNodeId = n.id;
      drag = { n, dx: event.clientX - n.x, dy: event.clientY - n.y };
      render();
    };
    el.querySelector('.port.out').onpointerdown = (event) => {
      event.stopPropagation();
      linking = { source: n.id, x: event.clientX - 78, y: event.clientY - 64 };
    };
    el.querySelector('.port.in').onpointerup = (event) => {
      event.stopPropagation();
      if (linking) connect(linking.source, n.id);
      linking = null;
      drawEdges();
    };
    canvas.appendChild(el);
  }
  drawEdges();
}

function connect(source, target) {
  const s = nodes.find((n) => n.id === source);
  const t = nodes.find((n) => n.id === target);
  if (!s || !t || s.id === t.id) return;
  if (!allowed.has(s.type + "->" + t.type)) {
    alert("该节点类型不允许连接：" + labels[s.type] + " -> " + labels[t.type]);
    return;
  }
  if (!edges.some((e) => e.source === source && e.target === target)) {
    edges.push({ id: "edge_" + Date.now(), source, target });
  }
}

function portPoint(id, side) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return { x: 0, y: 0 };
  const width = node.type === "video" ? 346 : 322;
  return { x: node.x + (side === "out" ? width : 0), y: node.y + 20 + 70 };
}

function drawEdges(temp) {
  const svg = document.getElementById("edges");
  svg.innerHTML = "";
  for (const edge of edges) {
    const a = portPoint(edge.source, "out");
    const b = portPoint(edge.target, "in");
    drawPath(svg, a, b);
  }
  if (temp) drawPath(svg, temp.a, temp.b, true);
}

function drawPath(svg, a, b, temp) {
  const c = Math.max(90, Math.abs(b.x - a.x) * 0.5);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "edge");
  path.setAttribute("d", "M " + a.x + " " + a.y + " C " + (a.x + c) + " " + a.y + ", " + (b.x - c) + " " + b.y + ", " + b.x + " " + b.y);
  if (temp) path.style.strokeDasharray = "7 6";
  svg.appendChild(path);
}

document.onpointermove = (event) => {
  if (drag) {
    drag.n.x = event.clientX - drag.dx;
    drag.n.y = event.clientY - 64 - drag.dy + 64;
    render();
  }
  if (linking) {
    const a = portPoint(linking.source, "out");
    drawEdges({ a, b: { x: event.clientX - 78, y: event.clientY - 64 } });
  }
};

document.onpointerup = () => {
  drag = null;
  linking = null;
  drawEdges();
};

function deleteNode(id) {
  nodes = nodes.filter((n) => n.id !== id);
  edges = edges.filter((e) => e.source !== id && e.target !== id);
  render();
}

async function fillModels(id) {
  const models = await api("/api/model-configs");
  const select = document.getElementById("m_" + id);
  if (!select) return;
  const available = models.filter((item) => item.enabled && ["text-to-video", "image-to-video", "video-to-video"].includes(item.modelType));
  if (!available.length) {
    document.getElementById("msg_" + id).innerHTML = '暂无可用模型，请先到设置中心配置 API。 <a href="#" onclick="show(\\'settings\\')">去设置</a>';
    return;
  }
  select.innerHTML = '<option value="">选择已启用模型</option>' + available.map((item) => '<option value="' + item.id + '">' + item.displayName + '</option>').join("");
}

async function loadOptions(id) {
  const modelConfigId = document.getElementById("m_" + id).value;
  if (!modelConfigId) return;
  const options = await api("/api/model-capabilities/options", {
    method: "POST",
    body: JSON.stringify({
      modelConfigId,
      nodeContext: {
        inputMode: "text-to-video",
        hasImageInput: edges.some((e) => e.target === id && nodes.find((n) => n.id === e.source)?.type === "image"),
        hasVideoInput: edges.some((e) => e.target === id && nodes.find((n) => n.id === e.source)?.type === "video"),
        hasReferenceImage: false,
        hasFirstLastFrame: false
      }
    })
  });
  for (const [key, arr] of [["mode", options.availableInputModes], ["ratio", options.availableAspectRatios], ["res", options.availableResolutions], ["dur", options.availableDurations]]) {
    document.getElementById(key + "_" + id).innerHTML = arr.map((item) => '<option value="' + item + '">' + item + (key === "dur" ? "s" : "") + '</option>').join("");
  }
}

async function createModel() {
  const preset = presets.find((item) => item.id === document.getElementById("preset").value);
  await api("/api/model-configs", {
    method: "POST",
    body: JSON.stringify({
      displayName: document.getElementById("displayName").value || document.getElementById("modelName").value || "Mock 视频模型",
      provider: document.getElementById("provider").value || preset.provider,
      apiBaseUrl: document.getElementById("apiBaseUrl").value,
      apiKey: document.getElementById("apiKey").value,
      modelName: document.getElementById("modelName").value || "mock-video-model",
      modelType: document.getElementById("modelType").value,
      enabled: document.getElementById("enabled").checked,
      capabilities: preset.capabilities
    })
  });
  document.getElementById("displayName").value = "";
  document.getElementById("apiKey").value = "";
  refresh();
  alert("模型已保存");
}

async function refresh() {
  const modelList = document.getElementById("models");
  if (modelList) {
    const models = await api("/api/model-configs");
    modelList.innerHTML = models.length ? models.map((m) => '<div class="card"><b>' + m.displayName + '</b><div class="muted">' + m.provider + ' · ' + m.modelName + ' · ' + (m.maskedApiKey || "未填 Key") + '</div><div class="muted">' + m.modelType + ' · ' + (m.enabled ? "已启用" : "已禁用") + '</div></div>').join("") : '<div class="empty">还没有模型。保存一个模型后，视频节点才会出现可选模型。</div>';
  }
  const historyList = document.getElementById("historyList");
  if (historyList) {
    const history = await api("/api/history");
    historyList.innerHTML = history.length ? history.map((item) => '<div class="card"><b>' + item.modelDisplayName + ' · ' + item.status + '</b><div class="muted">' + (item.prompt || "") + '</div><div class="ok">' + (item.outputUrl || item.errorMessage || "") + '</div></div>').join("") : '<div class="empty">还没有生成历史。</div>';
  }
}

async function generate(id) {
  const body = {
    nodeId: id,
    modelConfigId: document.getElementById("m_" + id).value,
    inputMode: document.getElementById("mode_" + id).value || "text-to-video",
    prompt: document.getElementById("p_" + id).value,
    duration: Number(document.getElementById("dur_" + id).value),
    aspectRatio: document.getElementById("ratio_" + id).value,
    resolution: document.getElementById("res_" + id).value,
    generateCount: Number(document.getElementById("count_" + id).value || 1)
  };
  const result = await api("/api/generate/video", { method: "POST", body: JSON.stringify(body) });
  const msg = document.getElementById("msg_" + id);
  msg.className = result.status === "success" ? "ok" : "danger";
  msg.textContent = result.status === "success" ? "生成成功：" + result.outputUrl : result.errorMessage;
  if (result.status === "success") document.getElementById("preview_" + id).textContent = "Mock 输出：" + result.outputUrl;
  refresh();
}

function composeNode(id) {
  const msg = document.getElementById("msg_" + id);
  msg.className = "ok";
  msg.textContent = "模拟合成完成。后续接入 FFmpeg。";
}

function runSelected() {
  const node = nodes.find((item) => item.id === selectedNodeId);
  if (node?.type === "video") generate(node.id);
}

async function saveProject() {
  await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "AIGC 视频工作流", nodes, edges }) });
  alert("项目已保存到预览数据库");
}

refresh();
addNode("image");
addNode("text");
addNode("video");
</script>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:3000");
  if (req.method === "OPTIONS") return json(res, {});
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html());
  }
  if (url.pathname === "/api/model-capability-presets") return json(res, presets);
  if (url.pathname === "/api/model-configs" && req.method === "GET") return json(res, readDb().modelConfigs);
  if (url.pathname === "/api/model-configs" && req.method === "POST") {
    const body = await readBody(req);
    const db = readDb();
    const item = {
      id: `model_${crypto.randomBytes(5).toString("hex")}`,
      provider: body.provider || "Custom API",
      displayName: body.displayName || "Mock 视频模型",
      apiBaseUrl: body.apiBaseUrl || "",
      maskedApiKey: mask(body.apiKey),
      modelName: body.modelName || "mock-video-model",
      modelType: body.modelType || "text-to-video",
      enabled: body.enabled !== false,
      capabilities: body.capabilities || presets[0].capabilities,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.modelConfigs.unshift(item);
    writeDb(db);
    return json(res, item, 201);
  }
  if (url.pathname === "/api/model-capabilities/options" && req.method === "POST") {
    const body = await readBody(req);
    const model = readDb().modelConfigs.find((item) => item.id === body.modelConfigId);
    if (!model) return json(res, { error: "Model config not found" }, 404);
    const availableDurations = durations(model.capabilities.duration);
    return json(res, {
      availableDurations,
      availableAspectRatios: model.capabilities.aspectRatios,
      availableResolutions: model.capabilities.resolutions,
      availableInputModes: model.capabilities.inputModes,
      lockedFields: { duration: model.capabilities.duration.type === "fixed" },
      normalizedSelection: {
        duration: availableDurations[0],
        aspectRatio: model.capabilities.aspectRatios[0],
        resolution: model.capabilities.resolutions[0],
        inputMode: model.capabilities.inputModes[0]
      }
    });
  }
  if (url.pathname === "/api/generate/video" && req.method === "POST") {
    const body = await readBody(req);
    const db = readDb();
    const model = db.modelConfigs.find((item) => item.id === body.modelConfigId && item.enabled);
    if (!model) return json(res, { status: "error", errorMessage: "模型配置不存在或已禁用" }, 400);
    const outputUrl = `/uploads/generated/${body.nodeId}-${Date.now()}.json`;
    db.history.unshift({ id: `history_${Date.now()}`, ...body, modelDisplayName: model.displayName, status: "success", outputUrl, createdAt: Date.now() });
    writeDb(db);
    return json(res, { status: "success", outputAssetId: `asset_${Date.now()}`, outputUrl });
  }
  if (url.pathname === "/api/history") return json(res, readDb().history);
  if (url.pathname === "/api/projects" && req.method === "POST") {
    const body = await readBody(req);
    const db = readDb();
    const item = { id: `project_${Date.now()}`, name: body.name || "AIGC 视频工作流", nodes: body.nodes || [], edges: body.edges || [], createdAt: Date.now(), updatedAt: Date.now() };
    db.projects.unshift(item);
    writeDb(db);
    return json(res, item, 201);
  }
  return json(res, { error: "Not found" }, 404);
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Standalone preview running at http://localhost:3000");
});
