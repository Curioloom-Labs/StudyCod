import React from "react";
import { useTranslation } from "react-i18next";
import { Upload, Award } from "lucide-react";
import { Button } from "../../components/ui/Button";

export type DiplomaImport = {
  name: string;
  htmlTemplate: string;
  cssTemplate: string;
  fields?: Array<{ fieldKey: string; isEnabled?: boolean; isRequired?: boolean }>;
};

function isDiplomaImport(value: unknown): value is DiplomaImport {
  if (typeof value !== "object" || value === null) return false;
  const template = value as Record<string, unknown>;
  return typeof template.name === "string"
    && typeof template.htmlTemplate === "string"
    && template.htmlTemplate.trim().length > 0
    && typeof template.cssTemplate === "string";
}

export function TournamentDiplomaImport({ onLoad }: { onLoad: (template: DiplomaImport) => void }) {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language.startsWith("en") ? en : uk;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState("");
  const [loadingDesign, setLoadingDesign] = React.useState(false);

  const loadBuiltInDesign = async () => {
    setError("");
    setLoadingDesign(true);
    try {
      const response = await fetch("/certificates/code-form/automatic.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("design unavailable");
      const template: unknown = await response.json();
      if (!isDiplomaImport(template)) throw new Error("invalid design");
      onLoad(template);
    } catch {
      setError(tr("Не вдалося завантажити макет. Спробуй оновити сторінку.", "Could not load the design. Refresh the page and retry."));
    } finally {
      setLoadingDesign(false);
    }
  };

  const importJson = async (file: File) => {
    if (file.size > 5_000_000) throw new Error("size");
    const value: unknown = JSON.parse(await file.text());
    if (!isDiplomaImport(value)) throw new Error("shape");
    const template = value as DiplomaImport;
    if (Array.isArray(template.fields)) {
      template.fields = template.fields
        .filter(field => field != null && typeof field.fieldKey === "string")
        .map(field => ({
          fieldKey: String(field.fieldKey),
          isEnabled: field.isEnabled !== false,
          isRequired: field.isRequired === true,
        }));
    }
    onLoad(template);
    setError("");
  };

  return <div className="mb-4 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{tr("Дипломи «Код форми»", "Code Form certificates")}</h3>
        <p className="mt-1 max-w-xl text-xs leading-5 text-text-secondary">
          {tr("Один макет автоматично створить диплом учасника або диплом за 1–3 місце з підписом. Місце береться з підтвердженого розподілу.", "One template automatically creates a participation or 1st–3rd place certificate with the organizer signature. Places come from confirmed awards.")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={loadingDesign} onClick={() => void loadBuiltInDesign()}>
          <Award className="mr-2 h-4 w-4" />
          {loadingDesign ? tr("Завантажуємо…", "Loading…") : tr("Застосувати дизайн", "Apply design")}
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />{tr("Імпортувати JSON", "Import JSON")}
        </Button>
      </div>
    </div>
    <input
      ref={fileRef}
      className="sr-only"
      type="file"
      accept=".json,application/json"
      aria-label={tr("Файл шаблону диплома", "Certificate template file")}
      onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
          await importJson(file);
        } catch {
          setError(tr("Потрібен JSON-шаблон до 5 МБ із полями name, htmlTemplate та cssTemplate.", "Choose a JSON template under 5 MB with name, htmlTemplate and cssTemplate fields."));
        }
      }}
    />
    {error && <p role="alert" className="mt-2 text-sm text-accent-error">{error}</p>}
  </div>;
}
