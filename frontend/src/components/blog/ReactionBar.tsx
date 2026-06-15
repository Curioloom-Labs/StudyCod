import React from "react";
import { BLOG_REACTION_EMOJIS, reactToBlog, type ReactionItem } from "../../lib/api/blog";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { showToast } from "../../lib/toast";

type Props = {
  targetType: "POST" | "COMMENT";
  targetId: number;
  initial: ReactionItem[];
  compact?: boolean;
};

/**
 * Emoji reaction bar for a post or comment. Shows existing reactions with counts
 * and a "+" picker; one reaction per principal (toggling/replacing server-side).
 */
export const ReactionBar: React.FC<Props> = ({ targetType, targetId, initial, compact }) => {
  const [items, setItems] = React.useState<ReactionItem[]>(initial);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const react = async (emoji: string) => {
    if (busy) return;
    setBusy(true);
    setPicking(false);
    try {
      const res = await reactToBlog({ targetType, targetId, emoji });
      setItems(res.reactions);
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, "Failed") });
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <button
          key={it.emoji}
          type="button"
          disabled={busy}
          onClick={() => react(it.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border transition ${size} ${
            it.reacted
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-text-secondary hover:border-primary/40"
          }`}
        >
          <span>{it.emoji}</span>
          {it.count > 0 ? <span className="font-mono">{it.count}</span> : null}
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPicking((p) => !p)}
          className={`inline-flex items-center rounded-full border border-border text-text-secondary hover:border-primary/40 transition ${size}`}
          aria-label="Add reaction"
        >
          ＋
        </button>
        {picking ? (
          <div className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-border bg-surface p-1 shadow-md">
            {BLOG_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className="rounded px-1.5 py-1 text-base hover:bg-bg-hover"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
