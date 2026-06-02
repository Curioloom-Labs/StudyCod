/**
 * Request-scoped context carried implicitly via AsyncLocalStorage.
 *
 * The goal is end-to-end correlation: a single `requestId` should appear on
 * EVERY log line emitted while handling a request — including deep judge/LLM
 * logs that never receive the Express `req`. Threading the id through every
 * function signature is invasive and easy to forget; AsyncLocalStorage lets the
 * logger read the active id automatically. When there is no active context
 * (startup, background workers) the helpers simply return undefined.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  /** Optional principal id for correlation; populated by auth when available. */
  principalId?: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` (and everything it awaits) with the given request context active. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Merge fields into the active context in place (no-op outside a request). */
export function setRequestContextFields(fields: Partial<RequestContext>): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  Object.assign(ctx, fields);
}
