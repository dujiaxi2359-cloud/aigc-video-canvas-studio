import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthUser, AuthWorkspace } from "../types/auth.js";

export type RequestContext = { user: AuthUser; workspace: AuthWorkspace };
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T) {
  return storage.run(context, callback);
}

export function currentRequestContext() {
  return storage.getStore();
}

export function requireRequestContext() {
  const context = storage.getStore();
  if (!context) throw new Error("REQUEST_CONTEXT_REQUIRED");
  return context;
}
