import { EventEmitter } from "events";

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
  | { kind: "announcement"; id: number; text: string; author: string; at: number };

const emitter = new EventEmitter();
// SSE fans out to many concurrent listeners per contest; disable the warning cap.
emitter.setMaxListeners(0);

function channel(contestId: number): string {
  return `contest:${contestId}`;
}

export function publishContestEvent(contestId: number, event: ContestEvent): void {
  if (!Number.isFinite(contestId) || contestId <= 0) return;
  emitter.emit(channel(contestId), event);
}

export function subscribeContestEvents(contestId: number, listener: (event: ContestEvent) => void): () => void {
  const ch = channel(contestId);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}
