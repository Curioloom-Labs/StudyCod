import React from "react";
import { useTranslation } from "react-i18next";
import { Upload, Award } from "lucide-react";
import { Button } from "../../components/ui/Button";

export type DiplomaImport = { name: string; htmlTemplate: string; cssTemplate: string; fields?: Array<{ fieldKey: string; isEnabled?: boolean; isRequired?: boolean }> };

export function TournamentDiplomaImport({ onLoad }: { onLoad: (template: DiplomaImport) => void }) {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language.startsWith("en") ? en : uk;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState("");
  const [loadingDesign, setLoadingDesign] = React.useState(false);
  return <div className="mb-4 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-text-primary">{tr("Дипломи «Код форми»", "Code Form certificates")}</h3><p className="mt-1 max-w-xl text-xs leading-5 text-text-secondary">{tr("Учасник та 1–3 місце в стилі нагород турніру. Автоматичний шаблон підбирає оформлення за підтвердженим місцем.", "Participation and 1st–3rd place designs inspired by the tournament trophies. The automatic template selects the design from confirmed awards.")}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={loadingDesign} onClick={async () => {
        setError(""); setLoadingDesign(true);
        try {
          const { createTournamentDiploma } = await import("../../../../shared/tournamentDiplomas");
          onLoad(createTournamentDiploma("automatic"));
        } catch { setError(tr("Не вдалося завантажити дизайн. Спробуй ще раз.", "Could not load the design. Please retry.")); }
        finally { setLoadingDesign(false); }
      }}><Award className="mr-2 h-4 w-4" />{loadingDesign ? tr("Завантажуємо…", "Loading…") : tr("Застосувати дизайн", "Apply design")}</Button><Button variant="ghost" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{tr("Імпортувати JSON", "Import JSON")}</Button></div>
    </div>
    <input ref={fileRef} className="sr-only" type="file" accept=".json,application/json" aria-label={tr("Файл шаблону диплома", "Certificate template file")} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      try {
        if (file.size > 5_000_000) throw new Error("size");
        const value: unknown = JSON.parse(await file.text());
        if (!value || typeof value !== "object") throw new Error("shape");
        const v = value as Record<string, unknown>;
        if (typeof v.name !== "string" || typeof v.htmlTemplate !== "string" || !v.htmlTemplate.trim() || typeof v.cssTemplate !== "string") throw new Error("shape");
        const fields = Array.isArray(v.fields) ? v.fields.filter((f): f is Record<string, unknown> => f != null && typeof f === "object").filter(f => typeof f.fieldKey === "string").map(f => ({ fieldKey: String(f.fieldKey), isEnabled: f.isEnabled !== false, isRequired: f.isRequired === true })) : undefined;
        onLoad({ name: v.name.slice(0, 180), htmlTemplate: v.htmlTemplate, cssTemplate: v.cssTemplate, fields }); setError("");
      } catch { setError(tr("Потрібен JSON-шаблон до 5 МБ із полями name, htmlTemplate та cssTemplate.", "Choose a JSON template under 5 MB with name, htmlTemplate and cssTemplate fields.")); }
    }} />
    {error && <p role="alert" className="mt-2 text-sm text-accent-error">{error}</p>}
  </div>;
}
