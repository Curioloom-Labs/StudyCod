import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { User, CourseLanguage } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { updateProfile } from "../lib/api/profile";
import { linkGoogleAccount } from "../lib/api/auth";
interface Props {
  user: User;
  onUserChange: (u: User) => void;
}
export const ProfilePage: React.FC<Props> = ({
  user,
  onUserChange
}) => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isStudent = !!user.studentId;
  const isEducational = user.userMode === "EDUCATIONAL";
  const [course, setCourse] = useState<CourseLanguage>(user.course);
  const [avatarUrl, setAvatarUrl] = useState<string>(user.avatarUrl ?? "");
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg(tr("Підтримуються лише зображення (png/jpg).", "Only images are supported (png/jpg)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setAvatarData(data);
      setAvatarUrl(data);
    };
    reader.readAsDataURL(file);
  }, []);
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };
  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  };
  const handleSave = async () => {
    if (isEducational && !isStudent) {
      setMsg(t('teachersCannotChangeProfile'));
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const updated = await updateProfile({
        course: isStudent ? undefined : course,
        avatarUrl: avatarData ? undefined : avatarUrl || null,
        avatarData: avatarData ?? null
      });
      onUserChange(updated);
      setMsg(t('changesSaved'));
    } catch (err: any) {
      setMsg(err?.response?.data?.message ?? t('profileSaveError'));
    } finally {
      setSaving(false);
    }
  };
  return <div className="min-h-0 flex flex-col bg-bg-base">
      {}
      <div className="border-b border-border bg-bg-surface p-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-mono text-text-primary">{t('profile')}</h1>
      </div>

      {}
      <div className="p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="p-6 border">
            <div className="flex gap-4 items-center mb-4">
              <div className="w-16 h-16 border border-border flex items-center justify-center font-mono text-xl text-text-primary">
                {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <h1 className="text-lg font-mono text-text-primary mb-1">
                  {isStudent ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : user.username}
                </h1>
                <p className="text-xs font-mono text-text-secondary">
                  {isStudent ? <>
                      {t('classLabel')}: <span className="text-text-primary">{user.className || t('unknown')}</span>
                      {user.email && <> · {t('email')}: <span className="text-text-primary">{user.email}</span></>}
                    </> : <>
                      {t('language')}: <span className="text-text-primary">{course}</span>
                      {!isEducational && <> · {t('difus')}: <span className="text-text-primary">{user.difus === 1 ? t('advanced') : t('basic')}</span></>}
                    </>}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border space-y-6">
            {!isStudent && !isEducational && <div>
                <h2 className="text-sm font-mono text-text-primary mb-3">{t('programmingLanguage')}</h2>
                <div className="flex gap-2">
                  <button className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${course === "JAVA" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"}`} onClick={() => setCourse("JAVA")}>
                    Java
                  </button>
                  <button className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${course === "PYTHON" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"}`} onClick={() => setCourse("PYTHON")}>
                    Python
                  </button>
                </div>
                <p className="text-xs font-mono text-text-muted mt-2">
                  {t('taskHistorySaved')}
                </p>
              </div>}
            {isStudent && <div>
                <h2 className="text-sm font-mono text-text-primary mb-3">{t('studentInfo')}</h2>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">{t('classLabel')}:</span>
                    <span className="text-text-primary">{user.className || t('unknown')}</span>
                  </div>
                  {user.email && <div className="flex justify-between">
                      <span className="text-text-secondary">{t('email')}:</span>
                      <span className="text-text-primary">{user.email}</span>
                    </div>}
                  <div className="flex justify-between">
                    <span className="text-text-secondary">{t('programmingLanguage')}:</span>
                    <span className="text-text-primary">{user.course}</span>
                  </div>
                </div>
                <p className="text-xs font-mono text-text-muted mt-2">
                  {t('languageDeterminedByTeacher')}
                </p>
              </div>}

            <div>
              <h2 className="text-sm font-mono text-text-primary mb-3">{t('profileAvatar')}</h2>
              <div onDrop={onDrop} onDragOver={e => e.preventDefault()} className="border border-dashed border-border bg-bg-code p-6 text-center cursor-pointer hover:border-primary transition-fast">
                <p className="text-xs font-mono text-text-primary mb-1">{t('dragOrChooseFile')}</p>
                <input type="file" accept="image/*" className="mt-2 text-xs font-mono" onChange={onSelectFile} />
              </div>
            </div>

            {msg && <div className={`text-xs font-mono ${msg.includes(t('error')) ? "text-accent-error" : "text-accent-success"}`}>
                {msg}
              </div>}

            {!isEducational && <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? t('saving') : t('saveChanges')}
              </Button>}
            {isStudent && <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? t('saving') : t('saveAvatar')}
              </Button>}
            {isEducational && !isStudent && <p className="text-xs font-mono text-text-muted text-center">
                {t('teachersCannotChangeLanguage')}
              </p>}

            {!user.googleId && <div>
                <h2 className="text-sm font-mono text-text-primary mb-3">{t('googleConnection')}</h2>
                <button onClick={() => {
              setLinkingGoogle(true);
              const base = import.meta.env.VITE_API_URL || window.location.origin;
              window.location.href = `${base}/auth/google?link=true`;
            }} disabled={linkingGoogle} className="w-full flex items-center justify-center gap-2 border border-border bg-bg-code hover:bg-bg-hover px-4 py-2 text-sm font-mono text-text-primary transition-fast disabled:opacity-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {linkingGoogle ? t('linking') : t('linkGoogleAccount')}
                </button>
                <p className="text-xs font-mono text-text-muted mt-2">
                  {t('afterLinkingCanLogin')}
                </p>
              </div>}

            {user.googleId && <div>
                <h2 className="text-sm font-mono text-text-primary mb-3">{tr("Google акаунт", "Google account")}</h2>
                <p className="text-xs font-mono text-text-secondary">
                  {tr("✅ Ваш Google акаунт підв'язано. Ви можете входити через Google.", "✅ Your Google account is linked. You can sign in with Google.")}
                </p>
              </div>}
          </Card>
        </div>
      </div>
    </div>;
};
export default ProfilePage;