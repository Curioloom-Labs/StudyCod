import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useLocalParticipant } from "@livekit/components-react";
import { tr } from "../i18n";

const TOPIC = "raisehand";
const REBROADCAST_MS = 3000; // keep the hand visible to late-joining teachers
const EXPIRY_MS = 7000; // drop a hand if a student leaves without lowering it

const enc = new TextEncoder();
const dec = new TextDecoder();

type HandMsg = { identity: string; name: string; raised: boolean };

/**
 * Student control: toggle a raised hand. Broadcast over the LiveKit data channel
 * and re-sent periodically while raised so a teacher who joins later still sees
 * it. Must be rendered inside <LiveKitRoom>.
 */
export const RaiseHandButton: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
  const [raised, setRaised] = useState(false);
  const { send } = useDataChannel(TOPIC);

  const broadcast = useCallback(
    (r: boolean) => {
      try {
        const msg: HandMsg = {
          identity: localParticipant?.identity ?? "me",
          name: localParticipant?.name || localParticipant?.identity || "—",
          raised: r
        };
        void send(enc.encode(JSON.stringify(msg)), { reliable: true });
      } catch {
        /* channel not ready */
      }
    },
    [send, localParticipant]
  );

  useEffect(() => {
    if (!raised) return;
    const id = window.setInterval(() => broadcast(true), REBROADCAST_MS);
    return () => window.clearInterval(id);
  }, [raised, broadcast]);

  const toggle = () => {
    const next = !raised;
    setRaised(next);
    broadcast(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-md px-3 py-1 text-xs font-mono transition-fast ${
        raised
          ? "bg-accent-warning/25 text-accent-warning"
          : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
      }`}
    >
      ✋ {raised ? tr("Руку піднято", "Hand raised") : tr("Підняти руку", "Raise hand")}
    </button>
  );
};

/**
 * Teacher view: the live queue of raised hands, oldest first. Listens on the
 * data channel and expires stale entries. Must be rendered inside <LiveKitRoom>.
 */
export const RaisedHandsBar: React.FC = () => {
  const [hands, setHands] = useState<Map<string, { name: string; at: number }>>(new Map());

  const onMsg = useCallback((m: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(dec.decode(m.payload)) as HandMsg;
      if (!msg || typeof msg.identity !== "string") return;
      setHands((prev) => {
        const next = new Map(prev);
        if (msg.raised) {
          const existing = next.get(msg.identity);
          // Preserve original raise time for fair ordering; just refresh "at".
          next.set(msg.identity, { name: msg.name || existing?.name || "—", at: Date.now() });
        } else {
          next.delete(msg.identity);
        }
        return next;
      });
    } catch {
      /* ignore malformed */
    }
  }, []);

  useDataChannel(TOPIC, onMsg);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHands((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (now - v.at > EXPIRY_MS) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const list = [...hands.values()];
  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-warning/10 px-4 py-1.5 text-xs font-mono">
      <span className="text-accent-warning">✋ {tr("Підняли руку", "Hands up")} ({list.length}):</span>
      {list.map((h, i) => (
        <span key={i} className="rounded bg-bg-hover/60 px-2 py-0.5 text-text-primary">
          {h.name}
        </span>
      ))}
    </div>
  );
};
