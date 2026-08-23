import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, Link2 } from "lucide-react";
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
  const [claimUser, setClaimUser] = useState("");
  const [claimPass, setClaimPass] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);

  // After enrolling/claiming, the cached user snapshot is stale (no studentId);
  // clear it and hard-navigate so getMe re-resolves the student view (Track B).
  const goToStudentArea = () => {
    try { localStorage.removeItem("studycod.userSnapshot"); } catch { /* ignore */ }
    window.location.href = "/edu/journal";
  };

  const claim = async () => {
    const username = claimUser.trim();
    if (!username || !claimPass) {
      showToast({ message: tr("Введіть логін і пароль", "Enter login and password"), type: "error" });
      return;
    }
    setClaimBusy(true);
    try {
      const { data } = await api.post(`/edu/students/claim`, { username, password: claimPass });
      const already = data?.claim?.alreadyClaimed;
      showToast({
        message: already ? tr("Акаунт уже привʼязано", "Account already linked") : tr("Акаунт привʼязано!", "Account linked!"),
        type: "success"
      });
      goToStudentArea();
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Невірний логін або пароль", "Invalid login or password")), type: "error" });
    } finally {
      setClaimBusy(false);
    }
  };

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
      goToStudentArea();
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
        eyebrow="// join"
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

      {/* Claim a legacy generated-credential account (Track B, incremental). */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(128,128,128,0.2)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {tr("Маєте логін від учителя?", "Have a login from your teacher?")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
          {tr("Привʼяжіть старий учнівський акаунт до цього профілю.", "Link your old student account to this profile.")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={claimUser}
            onChange={e => setClaimUser(e.target.value)}
            placeholder={tr("Логін учня", "Student login")}
            maxLength={120}
            autoComplete="off"
            style={{ padding: "10px 14px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(128,128,128,0.3)" }}
          />
          <input
            value={claimPass}
            onChange={e => setClaimPass(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") claim(); }}
            type="password"
            placeholder={tr("Пароль", "Password")}
            maxLength={200}
            autoComplete="off"
            style={{ padding: "10px 14px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(128,128,128,0.3)" }}
          />
          <Button variant="ghost" onClick={claim} disabled={claimBusy}>
            <Link2 size={16} /> {claimBusy ? tr("Привʼязка...", "Linking...") : tr("Привʼязати акаунт", "Link account")}
          </Button>
        </div>
      </div>
    </div>
  );
};
