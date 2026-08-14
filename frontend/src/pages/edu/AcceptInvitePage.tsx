import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

/**
 * Accept an org invitation by its token. Requires the visitor to be logged in
 * (wrapped in RequireToken). On success it materializes the membership/parent
 * link server-side, then routes the new member to the right home.
 */
export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setStatus("error");
        setMessage(tr("Невірне посилання запрошення.", "Invalid invitation link."));
        return;
      }
      try {
        const { data } = await api.post(`/edu/invites/${token}/accept`, {});
        if (!active) return;
        setStatus("ok");
        const dest = data?.role === "PARENT" ? "/edu/parent" : "/edu";
        window.setTimeout(() => navigate(dest, { replace: true }), 900);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(getErrorMessageFromUnknown(error, tr("Не вдалося прийняти запрошення.", "Couldn't accept the invitation.")));
      }
    })();
    return () => {
      active = false;
    };
  }, [token, navigate]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {status === "working" && <p className="font-mono text-text-muted">{tr("Приймаємо запрошення...", "Accepting invitation...")}</p>}
      {status === "ok" && <p className="font-mono text-text-primary">{tr("Готово! Перенаправляємо...", "Done! Redirecting...")}</p>}
      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-mono text-[#ef4444]">{message}</p>
          <button type="button" onClick={() => navigate("/edu", { replace: true })} className="text-sm text-primary underline">
            {tr("На головну", "Go to dashboard")}
          </button>
        </div>
      )}
    </div>
  );
};
