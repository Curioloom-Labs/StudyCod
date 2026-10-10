import { api } from "./client";
import { getCachedMeUser } from "./profile";

export type ContestJobStatus = "queued" | "running" | "completed" | "system_error";
type Receipt = { jobId: string; status: ContestJobStatus; statusUrl: string; result?: unknown };
type Pending = { key: string; fingerprint: string; receipt?: Receipt; body: Record<string, unknown> };
export type JobUpdate = (status: ContestJobStatus) => void;
function storageKey(contestId: number, problemId: number, kind: string): string {
  const user = getCachedMeUser();
  return `studycod:contest-job:${user?.studentId != null ? `student-${user.studentId}` : `user-${user?.id}`}:${contestId}:${problemId}:${kind}`;
}
function read(key: string): Pending | null {
  try { return JSON.parse(localStorage.getItem(key) || "null") as Pending | null; } catch { return null; }
}
function save(key: string, value: Pending): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Queue durability is server side. */ }
}
async function poll<T>(receipt: Receipt, onStatus?: JobUpdate): Promise<T> {
  let current = receipt;
  while (true) {
    onStatus?.(current.status);
    if (current.status === "completed") return current.result as T;
    if (current.status === "system_error") throw new Error("Не вдалося завершити перевірку через помилку судді. Відправку збережено.");
    await new Promise<void>(resolve => {
      const listener = (event: Event) => {
        if ((event as CustomEvent<{ jobId: string }>).detail?.jobId === receipt.jobId) done();
      };
      const done = () => { clearTimeout(timer); window.removeEventListener("studycod:contest-job", listener); resolve(); };
      const timer = setTimeout(done, 5000 + Math.random() * 1000);
      window.addEventListener("studycod:contest-job", listener);
    });
    try { current = (await api.get<Receipt>(receipt.statusUrl)).data; }
    catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403 || status === 404) throw error;
      // A temporary disconnect cannot cancel the accepted server job.
    }
  }
}
export async function submitContestJob<T>(contestId: number, problemId: number, kind: "check" | "run",
  body: Record<string, unknown>, onStatus?: JobUpdate): Promise<T> {
  const key = storageKey(contestId, problemId, kind);
  const identity = { ...body, turnstileToken: undefined };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
  const fingerprint = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  let pending = read(key);
  if (!pending || pending.fingerprint !== fingerprint) pending = { key: crypto.randomUUID(), fingerprint, body };
  save(key, pending);
  onStatus?.("queued");
  if (!pending.receipt) {
    let response;
    try {
      response = await api.post<Receipt>(`/contests/${contestId}/problems/${problemId}/${kind}`, body,
        { headers: { Prefer: "respond-async", "Idempotency-Key": pending.key } });
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status && status >= 400 && status < 500) localStorage.removeItem(key);
      throw error;
    }
    pending.receipt = response.data;
    save(key, pending);
  }
  let result: T;
  try { result = await poll<T>(pending.receipt, onStatus); }
  catch (error) { if (error instanceof Error && error.message.includes("помилку судді")) localStorage.removeItem(key); throw error; }
  localStorage.removeItem(key);
  return result;
}
export async function resumeContestJob<T>(contestId: number, problemId: number, kind: "check" | "run", onStatus?: JobUpdate): Promise<T | null> {
  const pending = read(storageKey(contestId, problemId, kind));
  if (!pending) return null;
  return submitContestJob<T>(contestId, problemId, kind, pending.body, onStatus);
}
export function hasPendingContestJob(contestId: number, problemId: number, kind: "check" | "run"): boolean {
  return Boolean(read(storageKey(contestId, problemId, kind)));
}
