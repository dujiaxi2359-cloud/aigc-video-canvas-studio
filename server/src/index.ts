import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getDb } from "./db/database.js";
import { assetRouter } from "./routes/asset.routes.js";
import { capabilityRouter } from "./routes/capability.routes.js";
import { generationRouter } from "./routes/generation.routes.js";
import { historyRouter } from "./routes/history.routes.js";
import { modelConfigRouter } from "./routes/modelConfig.routes.js";
import { projectRouter } from "./routes/project.routes.js";
import { diagnosticsRouter } from "./routes/diagnostics.routes.js";
import { ossDiagnosticsRouter } from "./routes/ossDiagnostics.routes.js";
import { agentRouter } from "./routes/agent.routes.js";
import { exportRouter } from "./routes/export.routes.js";
import { setupGlobalProxy } from "./utils/proxy.js";
import { logOssConfig } from "./services/assets/ossUpload.service.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

setupGlobalProxy();
logOssConfig();

if (!process.env.APP_SECRET || process.env.APP_SECRET === "replace-with-a-long-random-secret") {
  console.warn("APP_SECRET is not set. Development can continue, but set a long random APP_SECRET before real use.");
}

const app = express();
const port = Number(process.env.PORT ?? 4000);
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
const clientDistDir = path.resolve(process.cwd(), "../client/dist");

app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"] }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString(), version: "0.1.0" }));
app.use("/api/model-configs", modelConfigRouter);
app.use("/api/projects", projectRouter);
app.use("/api/assets", assetRouter);
app.use("/api/generate", generationRouter);
app.use("/api/history", historyRouter);
app.use("/api/diagnostics", diagnosticsRouter);
app.use("/api/diagnostics", ossDiagnosticsRouter);
app.use("/api/system", ossDiagnosticsRouter);
app.use("/api/agent", agentRouter);
app.use("/api/export", exportRouter);
app.use("/api", capabilityRouter);

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir, {
    etag: true,
    index: false,
    maxAge: "1y",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(400).json({ status: "error", errorCode: "SERVER_ERROR", errorMessage: message, error: message });
});

await getDb();
app.listen(port, () => {
  console.log(`AIGC Video Canvas Studio API listening on http://localhost:${port}`);
});
