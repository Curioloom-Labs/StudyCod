import { EventEmitter } from "events";
import { invalidateStandings } from "./standingsCache";

/**
 * In-process pub/sub for live contest updates delivered to clients over SSE.
 *
 * Events are intentionally low-detail: a `scoreboard` ping carries no scores, so
 * broadcasting it can never bypass the scoreboard freeze — clients react by
 * re-fetching the freeze-aware `/standings` endpoint. Announcements are already
 * public to everyone who can access the contest, so their text is safe to push.
 */
export type ContestEvent =
  | { kind: "scoreboard"; at: number }
  | { kind: "job"; jobId: string; participantId: number; status: string; at: number }
  | { kind: "announcement"; id: number; text: string; author: string; at: number };

const emitter = new EventEmitter();
const pendingBoards = new Map<number, NodeJS.Timeout>();
// SSE fans out to many concurrent listeners per contest; disable the warning cap.
emitter.setMaxListeners(0);

function channel(contestId: number): string {
  return `contest:${contestId}`;
}

export function publishContestEvent(contestId: number, event: ContestEvent): void {
  if (!Number.isFinite(contestId) || contestId <= 0) return;
  if (event.kind === "scoreboard") {
    invalidateStandings(contestId);
    if (!pendingBoards.has(contestId)) {
      const timer = setTimeout(() => {
        pendingBoards.delete(contestId);
        emitter.emit(channel(contestId), { kind: "scoreboard", at: Date.now() });
      }, 2_000);
      timer.unref();
      pendingBoards.set(contestId, timer);
    }
    return;
  }
  emitter.emit(channel(contestId), event);
}

export function subscribeContestEvents(contestId: number, listener: (event: ContestEvent) => void): () => void {
  const ch = channel(contestId);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}
