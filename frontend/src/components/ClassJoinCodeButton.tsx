import React, { useState, useEffect } from "react";
import { KeyRound, Copy, X } from "lucide-react";
import { Button } from "./ui/Button";
import { api } from "../lib/api/client";
import { tr } from "../i18n";
import { showToast } from "../lib/toast";
import { getErrorMessageFromUnknown } from "../lib/safeError";

/**
 * Teacher control for a class's self-enrolment join code (Student↔User, P1.4b).
 * Self-contained: reads the current code, generates/rotates or clears it.
 */
export const ClassJoinCodeButton: React.FC<{ classId: string | number }> = ({ classId }) => {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/edu/classes/${classId}/join-code`)
      .then(({ data }) => {
        if (active) setCode(data?.joinCode ?? null);
      })
      .catch(() => {
        /* non-fatal: leave code null */
      });
    return () => {
      active = false;
    };
  }, [classId]);

  const setEnabled = async (enabled: boolean) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/classes/${classId}/join-code`, { enabled });
      setCode(data?.joinCode ?? null);
      showToast({
        message: enabled ? tr("Код згенеровано", "Code generated") : tr("Код вимкнено", "Code disabled"),
        type: "success"
      });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => showToast({ message: tr("Скопійовано", "Copied"), type: "success" }),
      () => {}
    );
  };

  if (code) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <code
          style={{
            padding: "4px 8px",
            border: "1px solid rgba(128,128,128,0.3)",
            borderRadius: 6,
            letterSpacing: 1,
            fontWeight: 600
          }}
        >
          {code}
        </code>
        <Button variant="ghost" className="text-xs" onClick={copy} aria-label={tr("Скопіювати", "Copy")} disabled={busy}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => setEnabled(true)} disabled={busy}>
          {tr("Новий", "Rotate")}
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => setEnabled(false)} disabled={busy} aria-label={tr("Вимкнути", "Disable")}>
          <X className="w-4 h-4" />
        </Button>
      </span>
    );
  }

  return (
    <Button variant="ghost" className="text-xs" onClick={() => setEnabled(true)} disabled={busy}>
      <KeyRound className="w-4 h-4 mr-1" />
      {tr("Код приєднання", "Join code")}
    </Button>
  );
};
