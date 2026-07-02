import React, { useState } from "react";
import { Building2, Plus, Users, BookOpen, GraduationCap, Check } from "lucide-react";
import { Button } from "../ui/Button";
import { PageHero } from "../ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const controlClass =
  "w-full bg-bg-code border border-border text-text-primary rounded-[var(--ui-control-radius)] px-4 py-3 text-base leading-[1.45] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70 transition-colors placeholder:text-text-muted";

interface Props {
  /** Called once a school (organization) has been created. Parent should reload. */
  onCreated: (org: { id: number; name: string }) => void;
}

/**
 * First-run "Create your school" step for a teacher who has no organization yet.
 * Replaces the org-creation that was buried inside the Courses page: signing up as a
 * teacher now leads here, the creator becomes ORG_ADMIN, and the school console opens.
 */
export const CreateSchoolOnboarding: React.FC<Props> = ({ onCreated }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/orgs`, { name: trimmed });
      const org = data?.org;
      if (!org?.id) throw new Error("INVALID_RESPONSE");
      showToast({ type: "success", message: tr("Школу створено", "School created") });
      onCreated({ id: org.id, name: org.name ?? trimmed });
    } catch (error) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося створити школу", "Failed to create school")) });
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { icon: BookOpen, text: tr("Створюйте класи та призначайте вчителів", "Create classes and assign teachers") },
    { icon: Users, text: tr("Запрошуйте вчителів і асистентів за email", "Invite teachers and assistants by email") },
    { icon: GraduationCap, text: tr("Учні приєднуються за кодом класу", "Students join with a class code") }
  ];

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// onboarding"
        eyebrowAurora={tr("Початок", "Getting started")}
        title={tr("Створіть свою школу", "Create your school")}
        subtitle={tr(
          "Школа — це ваша організація в StudyCod. Ви станете її адміністратором.",
          "A school is your organization in StudyCod. You'll become its administrator."
        )}
        maxWidth="3xl"
      />

      <div className="px-4 md:px-8 py-8 max-w-2xl mx-auto">
        <div className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-6">
          <label htmlFor="school-name" className="flex items-center gap-2 text-sm font-mono text-text-primary leading-none mb-2.5">
            <Building2 className="w-4 h-4 shrink-0 text-primary" />
            {tr("Назва школи", "School name")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="school-name"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") create(); }}
              placeholder={tr("Напр. Ліцей №1 / Школа коду", "e.g. Lincoln High / Code School")}
              maxLength={200}
              className={controlClass + " flex-1"}
            />
            <Button onClick={create} disabled={busy || !name.trim()} className="sm:w-auto">
              <Plus className="w-4 h-4 mr-1.5" /> {busy ? tr("Створення…", "Creating…") : tr("Створити школу", "Create school")}
            </Button>
          </div>

          <div className="mt-6 pt-5 border-t border-border">
            <div className="text-xs font-mono uppercase tracking-[0.08em] text-text-muted leading-none mb-3">
              {tr("Що далі", "What's next")}
            </div>
            <ul className="space-y-2.5">
              {steps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-text-secondary">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </span>
                    {s.text}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 text-xs text-text-muted font-mono">
          <Check className="w-3.5 h-3.5 shrink-0 text-text-muted" />
          {tr("Це не вплине на ваш особистий акаунт чи контести.", "This won't affect your personal account or contests.")}
        </p>
      </div>
    </div>
  );
};
