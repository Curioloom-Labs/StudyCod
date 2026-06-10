import React, { useCallback, useEffect, useState } from "react";
import { tr } from "../i18n";
import {
  getBreakouts,
  openBreakouts,
  closeBreakouts,
  type BreakoutGroupDto,
} from "../lib/api/liveClassroom";

type Props = {
  classId: number;
  currentKind: string; // "main" | "breakout:N"
  onJoinGroup: (index: number) => void;
  onReturnMain: () => void;
};

/**
 * Teacher control for breakout rooms: split the class into N groups (each its
 * own LiveKit room), hop between them, and close them so everyone returns to the
 * main room. Students are auto-moved by the page when groups open/close.
 */
export const BreakoutPanel: React.FC<Props> = ({ classId, currentKind, onJoinGroup, onReturnMain }) => {
  const [active, setActive] = useState(false);
  const [groups, setGroups] = useState<BreakoutGroupDto[]>([]);
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getBreakouts(classId);
      setActive(s.active);
      setGroups(s.groups);
    } catch {
      /* keep last */
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleOpen = useCallback(async () => {
    setBusy(true);
    try {
      const res = await openBreakouts(classId, count);
      setGroups(res.groups);
      setActive(true);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [classId, count]);

  const handleClose = useCallback(async () => {
    setBusy(true);
    try {
      await closeBreakouts(classId);
      setActive(false);
      setGroups([]);
      onReturnMain();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [classId, onReturnMain]);

  return (
    <div className="border-b border-border bg-bg-base/50 px-4 py-2 text-xs font-mono">
      {!active ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-primary">👥 {tr("Групи (breakout)", "Breakout groups")}</span>
          <label className="text-text-secondary">
            {tr("К-ть:", "Count:")}{" "}
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded border border-border bg-bg-code px-2 py-0.5 text-text-primary focus:border-primary focus:outline-none"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleOpen()}
            className="rounded-md bg-primary/20 px-3 py-1 text-primary hover:bg-primary/30 disabled:opacity-50"
          >
            {tr("Відкрити групи", "Open groups")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-primary">👥 {tr("Групи активні", "Groups active")}:</span>
          {groups.map((g) => {
            const kind = `breakout:${g.index}`;
            return (
              <button
                key={g.index}
                type="button"
                onClick={() => onJoinGroup(g.index)}
                className={`rounded-md px-2 py-1 ${
                  currentKind === kind ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
                }`}
                title={g.students.map((s) => s.name).join(", ")}
              >
                {tr(`Група ${g.index + 1}`, `Group ${g.index + 1}`)} ({g.students.length})
              </button>
            );
          })}
          <button
            type="button"
            onClick={onReturnMain}
            className={`rounded-md px-2 py-1 ${
              currentKind === "main" ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
            }`}
          >
            {tr("Головна", "Main")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleClose()}
            className="rounded-md bg-secondary/15 px-3 py-1 text-secondary hover:bg-secondary/25 disabled:opacity-50"
          >
            {tr("Закрити групи", "Close groups")}
          </button>
        </div>
      )}
    </div>
  );
};

export default BreakoutPanel;
