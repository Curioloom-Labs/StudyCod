import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

/**
 * User self-enrolment into a class via a join code (Student↔User, dual-mode).
 * For an authenticated User who was given a class code by their teacher.
 */
export const JoinClassPage: React.FC = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      showToast({ message: tr("Введіть код", "Enter a code"), type: "error" });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/classes/join`, { code: trimmed });
      const already = data?.enrollment?.alreadyEnrolled;
      showToast({
        message: already ? tr("Ви вже у цьому класі", "You're already in this class") : tr("Вас зараховано!", "Enrolled!"),
        type: "success"
      });
      navigate(`/edu/journal`);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Невірний код", "Invalid code")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrowClassic="// join"
        eyebrowAurora={tr("Приєднання", "Join")}
        title={tr("Приєднатися до класу", "Join a class")}
        subtitle={tr("Введіть код, який дав вам викладач.", "Enter the code your teacher gave you.")}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") join();
          }}
          placeholder={tr("Напр. ABC123", "e.g. ABC123")}
          maxLength={16}
          style={{
            padding: "12px 14px",
            fontSize: 20,
            letterSpacing: 3,
            textAlign: "center",
            textTransform: "uppercase",
            borderRadius: 8,
            border: "1px solid rgba(128,128,128,0.3)"
          }}
        />
        <Button onClick={join} disabled={busy}>
          <KeyRound size={16} /> {busy ? tr("Приєднання...", "Joining...") : tr("Приєднатися", "Join")}
        </Button>
      </div>
    </div>
  );
};
