import type { NextFunction, Request, Response } from "express";

function isLoopback(value: string) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1" || value === "localhost";
}

export function isLocalAdminRequest(req: Request) {
  const directAddress = req.ip || req.socket.remoteAddress || "";
  const forwardedAddress = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const candidates = [directAddress, forwardedAddress].filter(Boolean);
  return candidates.length > 0 && candidates.every(isLoopback);
}

export function localAdminOnly(req: Request, res: Response, next: NextFunction) {
  if (isLocalAdminRequest(req)) return next();
  res.status(404).json({ status: "not_found", errorMessage: "Not found" });
}
