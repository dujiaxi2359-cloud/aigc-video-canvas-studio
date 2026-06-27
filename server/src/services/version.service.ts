import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type BuildVersion = {
  app: "MoonTv";
  branch: string;
  commit: string;
  buildTime: string;
};

function gitValue(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: path.resolve(process.cwd(), ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function buildVersionFile() {
  for (const candidate of [
    path.resolve(process.cwd(), ".build-version.json"),
    path.resolve(process.cwd(), "../.build-version.json")
  ]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as Partial<BuildVersion>;
      if (parsed.commit) return parsed;
    } catch {
      // Fall back to environment and Git metadata.
    }
  }
  return undefined;
}

export function getBuildVersion(): BuildVersion {
  const fileVersion = buildVersionFile();
  return {
    app: "MoonTv",
    branch: process.env.MOON_BUILD_BRANCH || fileVersion?.branch || gitValue(["branch", "--show-current"]) || "unknown",
    commit: process.env.MOON_BUILD_COMMIT || fileVersion?.commit || gitValue(["rev-parse", "HEAD"]) || "unknown",
    buildTime: process.env.MOON_BUILD_TIME || fileVersion?.buildTime || "unknown"
  };
}

export function getServerVersion(port: number) {
  return {
    ...getBuildVersion(),
    serverPath: process.argv[1] ? path.resolve(process.argv[1]) : fileURLToPath(import.meta.url),
    nodeEnv: process.env.NODE_ENV || "development",
    port: String(port)
  };
}
