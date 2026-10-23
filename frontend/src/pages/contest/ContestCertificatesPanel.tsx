import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Download, Eye, FileCheck2, FileUp, Loader2, Mail, RefreshCw, Search, Users, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { getContestAwards, type ContestAwards } from "../../lib/api/contestAwards";
import { createCertificateTemplate, updateCertificateTemplate, getCertificateTemplateById, getCertificateWorkspace,
  updateContestCertificateSettings, generateContestCertificates, previewContestCertificate, retryContestCertificateJobs,
  downloadContestCertificate, sendExistingContestCertificates, type CertificateWorkspaceData } from "../../lib/api/certificates";
import { diplomaLabel, eligibleForDiploma, parseCertificateDesign, type CertificateDesign } from "../../lib/certificates/workspace";
import "./ContestCertificatesPanel.css";

export const certificateWorkspaceService = {
  load: getCertificateWorkspace, awards: getContestAwards, template: getCertificateTemplateById,
  create: createCertificateTemplate, update: updateCertificateTemplate, settings: updateContestCertificateSettings,
  generate: generateContestCertificates, preview: previewContestCertificate, retry: retryContestCertificateJobs,
  download: downloadContestCertificate,
  send: sendExistingContestCertificates,
  builtIn: async () => {
    const response = await fetch("/certificates/code-form/automatic.json");
    if (!response.ok) throw new Error("DESIGN_UNAVAILABLE");
    return parseCertificateDesign(await response.json());
  },
};

type Step = "design" | "recipients" | "issue";
type Place = "1" | "2" | "3" | null;
type Props = { contestId: number; onOpenParticipants: () => void; service?: typeof certificateWorkspaceService };

function CertificateSheet({ html, loading }: { html: string; loading: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.5);
  React.useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(entries => setScale(entries[0].contentRect.width / 1122.52));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div className="cert-sheet" ref={ref} aria-busy={loading}>
    {html ? <iframe title="Попередній перегляд диплома / Certificate preview" sandbox="" srcDoc={html}
      style={{ width: 1122.52, height: 793.7, transform: `scale(${scale})` }} /> : <div className="cert-sheet-placeholder"><FileCheck2 aria-hidden="true" /><span>StudyCod</span></div>}
    {loading && <div className="cert-sheet-loading"><Loader2 className="animate-spin" aria-label="Завантаження / Loading" /></div>}
  </div>;
}

export function ContestCertificatesPanel({ contestId, onOpenParticipants, service = certificateWorkspaceService }: Props) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith("en");
  const tr = (uk: string, english: string) => en ? english : uk;
  const [step, setStep] = React.useState<Step>("design");
  const [workspace, setWorkspace] = React.useState<CertificateWorkspaceData | null>(null);
  const [awards, setAwards] = React.useState<ContestAwards | null>(null);
  const [draft, setDraft] = React.useState<CertificateDesign | null>(null);
  const [designDirty, setDesignDirty] = React.useState(false);
  const [settingsDirty, setSettingsDirty] = React.useState(false);
  const [sendEmail, setSendEmail] = React.useState(false);
  const [force, setForce] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [action, setAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [previewError, setPreviewError] = React.useState("");
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewPlace, setPreviewPlace] = React.useState<Place>(null);
  const [previewName, setPreviewName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [downloading, setDownloading] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const previewRequest = React.useRef(0);
  const dirty = designDirty || settingsDirty;
  const active = workspace?.generation.status === "queued" || workspace?.generation.status === "running";
  const busy = Boolean(action || active);
  const rows = awards ? (awards.confirmed && !awards.stale ? awards.rows : awards.suggested) : [];
  const eligible = rows.filter(eligibleForDiploma);
  const readyAwards = Boolean(awards?.confirmed && !awards.stale && !awards.pendingSubmissions);
  const recipientById = new Map(workspace?.recipients.map(row => [row.participantId, row]));
  const readyPdfs = eligible.filter(row => recipientById.get(row.participantId)?.pdfAvailable).length;
  const emailed = eligible.filter(row => recipientById.get(row.participantId)?.emailSentAt).length;
  const toEmail = eligible.filter(row => { const recipient = recipientById.get(row.participantId); return recipient?.pdfAvailable && recipient.email && !recipient.emailSentAt; }).length;
  const missingEmail = eligible.filter(row => !recipientById.get(row.participantId)?.email).length;
  const toGenerate = force ? eligible.length : eligible.length - readyPdfs;

  function readableError(cause: unknown): string {
    const raw = cause instanceof Error ? cause.message : String(cause || "");
    if (/AWARDS_STALE/.test(raw)) return tr("Результати змінилися. Підтвердь місця ще раз у розділі «Учасники».", "Results changed. Confirm the awards again in Participants.");
    if (/AWARDS_NOT_CONFIRMED/.test(raw)) return tr("Спочатку підтвердь місця у розділі «Учасники».", "Confirm the awards in Participants first.");
    if (/GENERATION_IN_PROGRESS/.test(raw)) return tr("Генерація вже триває. Її стан оновиться автоматично.", "Generation is already running. Progress updates automatically.");
    if (/TEMPLATE_TOO_LARGE/.test(raw)) return tr("HTML або CSS перевищує 50 МБ. Зменш вбудовані зображення й повтори збереження.", "HTML or CSS exceeds 50 MB. Reduce embedded images and save again.");
    if (/INVALID_TEMPLATE_FILE|SyntaxError|JSON/.test(raw)) return tr("Файл не є шаблоном StudyCod. Обери JSON із полями name, htmlTemplate та cssTemplate.", "Choose a StudyCod JSON template with name, htmlTemplate and cssTemplate fields.");
    if (/UNKNOWN_TEMPLATE_FIELDS/.test(raw)) return tr("У шаблоні є невідомі поля. Перевір HTML у розширених налаштуваннях.", "The template contains unknown fields. Check the HTML in advanced settings.");
    if (/ACCESS_DENIED|ONLY_USERS/.test(raw)) return tr("Немає доступу до сертифікатів цього контесту.", "You cannot manage certificates for this contest.");
    if (/TEMPLATE_NOT_FOUND/.test(raw)) return tr("Збережений макет недоступний. Обери інший дизайн і збережи його.", "The saved design is unavailable. Choose and save another design.");
    if (/TEMPLATE_SYNTAX_ERROR/.test(raw)) return tr("Помилка в HTML-шаблоні. Перевір синтаксис полів у подвійних фігурних дужках.", "The HTML template has a syntax error. Check the fields in double braces.");
    if (/CERTIFICATE_FILE_NOT_FOUND/.test(raw)) return tr("PDF ще недоступний. Онови список або повтори генерацію.", "The PDF is unavailable. Refresh the list or regenerate it.");
    if (/RENDERER_BROWSER_MISSING/.test(raw)) return tr("На сервері недоступний генератор PDF. Макет збережено, але видачу потрібно повторити після відновлення сервісу.", "The server PDF renderer is unavailable. The design is saved; retry after the service is restored.");
    return tr("Дію не вдалося завершити. Спробуй ще раз; збережені дані залишилися на сервері.", "Could not complete the action. Try again; saved data remains on the server.");
  }

  const requestPreview = React.useCallback(async (design: CertificateDesign, place: Place = null, participantId?: number) => {
    const request = ++previewRequest.current;
    setPreviewLoading(true); setPreviewError(""); setPreviewHtml("");
    try {
      const result = await service.preview(contestId, {
        ...(design.htmlTemplate ? { htmlTemplate: design.htmlTemplate, cssTemplate: design.cssTemplate } : { templateId: design.id || undefined }),
        participantId, place,
      });
      if (request === previewRequest.current) setPreviewHtml(result.html);
    } catch (cause) { if (request === previewRequest.current) setPreviewError(readableError(cause)); }
    finally { if (request === previewRequest.current) setPreviewLoading(false); }
  }, [contestId, service, en]);

  const load = React.useCallback(async (initialize = false) => {
    initialize ? setLoading(true) : setRefreshing(true);
    setError("");
    try {
      const [data, allocation] = await Promise.all([service.load(contestId), service.awards(contestId)]);
      setWorkspace(data); setAwards(allocation);
      if (initialize) {
        setSendEmail(data.settings.sendEmailEnabled);
        let design: CertificateDesign;
        if (data.settings.templateId) {
          const { template } = await service.template(data.settings.templateId);
          design = { ...template, htmlTemplate: template.htmlTemplate || "", cssTemplate: template.cssTemplate || "" };
        } else if (data.settings.mode === "studycod") {
          design = { id: null, contestId: null, name: "StudyCod", type: "studycod", htmlTemplate: "", cssTemplate: "", fields: [] };
        } else design = await service.builtIn();
        setDraft(design); setDesignDirty(data.settings.mode === "none"); setSettingsDirty(false);
        setPreviewPlace(null); setPreviewName("");
        await requestPreview(design);
      }
    } catch (cause) { setError(readableError(cause)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [contestId, service, requestPreview]);

  React.useEffect(() => { void load(true); return () => { previewRequest.current++; }; }, [contestId, service]);
  React.useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void service.load(contestId).then(setWorkspace).catch(() => setError(tr("Не вдалося оновити прогрес. Натисни «Оновити».", "Could not refresh progress. Select Refresh.")));
    }, 4000);
    return () => window.clearInterval(interval);
  }, [active, service, contestId, en]);

  async function chooseDesign(design: CertificateDesign) {
    setDraft(design); setDesignDirty(true); setMessage(""); setError(""); setPreviewName("");
    await requestPreview(design, previewPlace);
  }

  async function chooseBuiltIn() {
    setAction("design");
    try { await chooseDesign(await service.builtIn()); }
    catch (cause) { setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function chooseSaved(id: string) {
    if (!id) return;
    setAction("design");
    try {
      const { template } = await service.template(Number(id));
      await chooseDesign({ ...template, htmlTemplate: template.htmlTemplate || "", cssTemplate: template.cssTemplate || "" });
    } catch (cause) { setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setAction("import"); setError("");
    try {
      if (file.size > 110 * 1024 * 1024) throw new Error("TEMPLATE_TOO_LARGE");
      if (file.type.startsWith("image/") && /\.(png|jpe?g|webp)$/i.test(file.name)) {
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        const htmlTemplate = `<main class="diploma"><h1>{{name}}</h1><p class="contest">{{contest_name}}</p><p class="place">{{place}}</p><footer><span>{{date}}</span><span>{{organizer}}</span></footer><img class="qr" src="{{qr_code}}" alt="QR" /></main>`;
        await chooseDesign(parseCertificateDesign({ name: file.name.replace(/\.[^.]+$/, ""), htmlTemplate,
          cssTemplate: `.diploma{width:297mm;height:210mm;position:relative;box-sizing:border-box;background:url("${dataUrl}") center/contain no-repeat;color:#17251d;font-family:Arial,sans-serif}h1{position:absolute;left:20mm;right:20mm;top:91mm;text-align:center;font-size:30px}p.contest{position:absolute;top:115mm;width:100%;text-align:center}p.place{position:absolute;top:70mm;width:100%;text-align:center;font-size:24px}footer{position:absolute;bottom:20mm;left:24mm;right:24mm;display:flex;justify-content:space-between}.qr{position:absolute;bottom:8mm;left:8mm;width:14mm}` }));
      } else await chooseDesign(parseCertificateDesign(JSON.parse(await file.text())));
    } catch (cause) { setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function saveDesign(silent = false): Promise<boolean> {
    if (!draft) return false;
    setAction("save"); setError(""); setMessage("");
    try {
      let templateId = draft.id;
      let savedContestId = draft.contestId;
      if (designDirty || (!templateId && draft.htmlTemplate)) {
        if (draft.htmlTemplate) await service.preview(contestId, { htmlTemplate: draft.htmlTemplate, cssTemplate: draft.cssTemplate, place: previewPlace });
        const payload = { name: draft.name.trim() || "Диплом", type: draft.type, htmlTemplate: draft.htmlTemplate, cssTemplate: draft.cssTemplate, fields: draft.fields };
        if (templateId && draft.contestId === contestId) await service.update(templateId, payload);
        else { const result = await service.create({ ...payload, contestId }); templateId = result.templateId; savedContestId = contestId; }
        // Keep a successfully persisted template if the separate settings request fails.
        setDraft({ ...draft, id: templateId, contestId: savedContestId });
        setDesignDirty(false); setSettingsDirty(true);
      }
      await service.settings(contestId, { mode: draft.type, defaultTemplateId: templateId, sendEmailEnabled: sendEmail });
      setDraft({ ...draft, id: templateId, contestId: savedContestId });
      setDesignDirty(false); setSettingsDirty(false);
      setWorkspace(previous => previous ? { ...previous, settings: { mode: draft.type, templateId, sendEmailEnabled: sendEmail } } : previous);
      if (!silent) setMessage(tr("Макет і параметри видачі збережено.", "Design and delivery settings saved."));
      return true;
    } catch (cause) { setError(readableError(cause)); return false; }
    finally { setAction(null); }
  }

  async function generate() {
    if (!readyAwards || !eligible.length || !draft || busy) return;
    if (!await saveDesign(true)) return;
    setAction("generate");
    try {
      await service.generate(contestId, { forceRegenerate: force });
      setWorkspace(await service.load(contestId));
      setMessage(tr("Генерація запущена. Можеш залишити сторінку — процес продовжиться на сервері.", "Generation started. You can leave this page; processing continues on the server."));
    } catch (cause) { await load(); setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function retry() {
    setAction("retry"); setError("");
    try { await service.retry(contestId); setWorkspace(await service.load(contestId)); }
    catch (cause) { setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function sendExisting() {
    setAction("email"); setError("");
    try {
      const result = await service.send(contestId); setWorkspace(await service.load(contestId));
      setMessage(tr(`До надсилання додано дипломів: ${result.queued}.`, `Certificates queued for email: ${result.queued}.`));
    } catch (cause) { setError(readableError(cause)); }
    finally { setAction(null); }
  }

  async function download(participantId: number) {
    setDownloading(participantId);
    try {
      const blob = await service.download(contestId, participantId);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `StudyCod-${participantId}.pdf`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(readableError(cause)); }
    finally { setDownloading(null); }
  }

  const shownRows = rows.filter(row => (!query || row.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    && (filter === "all" || (filter === "eligible" ? eligibleForDiploma(row) : filter === "winners" ? eligibleForDiploma(row) && row.awardPlace : !eligibleForDiploma(row))))
    .sort((a, b) => (eligibleForDiploma(a) ? a.awardPlace || 4 : 5) - (eligibleForDiploma(b) ? b.awardPlace || 4 : 5) || a.displayName.localeCompare(b.displayName, "uk"));
  const generation = workspace?.generation;

  return <section className="cert-workspace" aria-label={tr("Сертифікати контесту", "Contest certificates")}>
    <header className="cert-header">
      <div><p className="cert-eyebrow">{tr("Нагороди контесту", "Contest awards")}</p><h2>{tr("Дипломи та сертифікати", "Diplomas and certificates")}</h2><p>{tr("Обери макет, перевір одержувачів і видай готові PDF.", "Choose a design, review recipients, and issue the PDFs.")}</p></div>
      <div className="cert-header-actions"><span className="cert-save-status">{dirty ? <><span className="cert-unsaved-dot" />{tr("Є незбережені зміни", "Unsaved changes")}</> : workspace?.settings.mode !== "none" ? <><Check className="size-4" />{tr("Збережено", "Saved")}</> : tr("Потрібне налаштування", "Setup needed")}</span><Button variant="ghost" size="touch" disabled={refreshing || loading} onClick={() => void load()}><RefreshCw className={refreshing ? "animate-spin" : ""} />{tr("Оновити", "Refresh")}</Button></div>
    </header>

    <nav className="cert-steps" aria-label={tr("Кроки видачі дипломів", "Certificate workflow")}>
      {([ ["design", tr("Дизайн", "Design")], ["recipients", tr("Одержувачі", "Recipients")], ["issue", tr("Видача", "Issue")] ] as Array<[Step, string]>).map(([key, label], index) => <button key={key} type="button" aria-current={step === key ? "step" : undefined} onClick={() => setStep(key)}><span>{index + 1}</span>{label}{key === "recipients" && awards ? <small>{eligible.length}</small> : null}</button>)}
    </nav>

    {error && <div className="cert-notice is-error" role="alert"><CircleAlert /><div>{error}</div><button type="button" aria-label={tr("Закрити повідомлення", "Dismiss message")} onClick={() => setError("")}><X /></button></div>}
    {message && <div className="cert-notice is-success" role="status"><CheckCircle2 /><div>{message}</div><button type="button" aria-label={tr("Закрити повідомлення", "Dismiss message")} onClick={() => setMessage("")}><X /></button></div>}

    {loading ? <div className="cert-loading" role="status"><div /><div /><div /><span>{tr("Завантажую налаштування, макет і список учасників…", "Loading settings, design and participants…")}</span></div> : !workspace ? <div className="cert-empty"><CircleAlert /><h3>{tr("Не вдалося відкрити сертифікати", "Could not open certificates")}</h3><p>{tr("Повтори завантаження, щоб отримати збережені налаштування.", "Retry to load the saved settings.")}</p><Button onClick={() => void load(true)}>{tr("Спробувати знову", "Try again")}</Button></div> : <>
      {step === "design" && <div className="cert-design-grid">
        <aside className="cert-design-controls">
          <div className="cert-section-heading"><span>01</span><h3>{tr("Обери макет", "Choose a design")}</h3></div>
          <button type="button" className={`cert-design-choice${draft?.name.includes("Код форми") || draft?.name.includes("Code Form") ? " is-selected" : ""}`} onClick={() => void chooseBuiltIn()} disabled={busy}><span className="cert-design-mini" aria-hidden="true">{`{ }`}<i>ДИПЛОМ</i></span><span><strong>{tr("Код форми", "Code Form")}</strong><small>{tr("4 варіанти · підпис · місця 1–3", "4 variants · signature · places 1–3")}</small></span></button>
          <label className="cert-label" htmlFor="cert-saved-design">{tr("Збережені макети", "Saved designs")}</label>
          <select id="cert-saved-design" value={draft?.id || ""} disabled={busy} onChange={event => void chooseSaved(event.target.value)}><option value="">{tr("Обрати з бібліотеки…", "Choose from library…")}</option>{draft?.id && !workspace.templates.some(t => t.id === draft.id) ? <option value={draft.id}>{draft.name}</option> : null}{workspace.templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.contestId == null ? tr(" · спільний", " · shared") : ""}</option>)}</select>
          <button className="cert-upload" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp /><strong>{tr("Імпортувати свій макет", "Import your design")}</strong><span>{tr("JSON або фон PNG, JPG, WebP", "JSON or PNG, JPG, WebP background")}</span></button>
          <input ref={fileRef} type="file" className="sr-only" accept=".json,.png,.jpg,.jpeg,.webp" aria-label={tr("Файл макета", "Design file")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} />
          {draft && <><label className="cert-label" htmlFor="cert-design-name">{tr("Назва макета", "Design name")}</label><input id="cert-design-name" value={draft.name} maxLength={180} disabled={busy} onChange={event => { setDraft({ ...draft, name: event.target.value }); setDesignDirty(true); }} />
          <details className="cert-code"><summary>{tr("Редагувати HTML і CSS", "Edit HTML and CSS")}</summary><p>{tr("Поля підставляються автоматично. Ліміт — 50 МБ на поле.", "Fields are filled automatically. Limit: 50 MB per field.")}</p><label htmlFor="cert-html">HTML</label><textarea id="cert-html" value={draft.htmlTemplate} disabled={busy} spellCheck={false} onChange={event => { setDraft({ ...draft, htmlTemplate: event.target.value, type: "custom" }); setDesignDirty(true); }} /><label htmlFor="cert-css">CSS</label><textarea id="cert-css" value={draft.cssTemplate} disabled={busy} spellCheck={false} onChange={event => { setDraft({ ...draft, cssTemplate: event.target.value }); setDesignDirty(true); }} /><p className="cert-field-help">{`{{name}} · {{contest_name}} · {{place}} · {{date}} · {{organizer}} · {{qr_code}}`}</p><Button variant="secondary" disabled={previewLoading || !draft.htmlTemplate.trim()} onClick={() => void requestPreview(draft, previewPlace)}><Eye />{tr("Оновити перегляд", "Update preview")}</Button></details></>}
        </aside>
        <div className="cert-preview-area"><div className="cert-preview-toolbar"><div><span className="cert-eyebrow">{tr("Попередній перегляд", "Preview")}</span><h3>{previewName || tr("Зразок диплома", "Sample diploma")}</h3></div><span>A4 · 297 × 210 мм</span></div>
          <div className="cert-variants" aria-label={tr("Варіант диплома", "Diploma variant")}>{([null, "1", "2", "3"] as Place[]).map(place => <button type="button" key={place || "participant"} aria-pressed={previewPlace === place} disabled={!draft || previewLoading} onClick={() => { setPreviewPlace(place); setPreviewName(""); if (draft) void requestPreview(draft, place); }}>{place ? tr(`${place} місце`, `${place}${place === "1" ? "st" : place === "2" ? "nd" : "rd"} place`) : tr("Учасник", "Participant")}</button>)}</div>
          <CertificateSheet html={previewHtml} loading={previewLoading} />
          {previewError ? <div className="cert-notice is-error" role="alert"><CircleAlert /><div>{previewError}<Button variant="ghost" disabled={!draft || previewLoading} onClick={() => draft && void requestPreview(draft, previewPlace)}>{tr("Повторити перегляд", "Retry preview")}</Button></div></div> : <p className="cert-preview-note">{tr("Перегляд формує сервер тим самим шаблонізатором, що й PDF. Зразок не видається й не надсилається.", "The server uses the PDF template engine for this preview. A sample is neither issued nor emailed.")}</p>}
        </div>
      </div>}

      {step === "recipients" && <div className="cert-recipients">
        <div className="cert-section-heading"><span>02</span><div><h3>{tr("Хто який диплом отримає", "Who receives which diploma")}</h3><p>{tr("Місця беруться з підтвердженого розподілу. Учасники без подач не отримують диплом.", "Places come from the confirmed allocation. Participants without submissions receive no diploma.")}</p></div></div>
        {!readyAwards && <div className="cert-notice is-warning"><CircleAlert /><div><strong>{tr(awards?.stale ? "Розподіл місць застарів" : "Місця ще не підтверджені", awards?.stale ? "Awards are out of date" : "Awards are not confirmed")}</strong><p>{tr("Поки показано пропозицію. Підтвердь її перед видачею дипломів.", "This is a suggested allocation. Confirm it before issuing diplomas.")}</p><Button variant="secondary" onClick={onOpenParticipants}>{tr("Перейти до місць", "Review awards")}<ArrowRight /></Button></div></div>}
        <div className="cert-totals"><div><strong>{eligible.length}</strong><span>{tr("отримають диплом", "will receive diplomas")}</span></div><div><strong>{eligible.filter(row => row.awardPlace).length}</strong><span>{tr("призових дипломів", "place diplomas")}</span></div><div><strong>{rows.length - eligible.length}</strong><span>{tr("без диплома", "without diploma")}</span></div></div>
        <div className="cert-table-tools"><label className="cert-search"><Search /><input aria-label={tr("Знайти учасника", "Find participant")} placeholder={tr("Знайти учасника…", "Find participant…")} value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label={tr("Фільтр одержувачів", "Recipient filter")} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{tr("Усі учасники", "All participants")}</option><option value="eligible">{tr("Отримають диплом", "Receive a diploma")}</option><option value="winners">{tr("Призові місця", "Place diplomas")}</option><option value="excluded">{tr("Без диплома", "No diploma")}</option></select></div>
        <div className="cert-table-wrap"><table><caption className="sr-only">{tr("Одержувачі дипломів", "Diploma recipients")}</caption><thead><tr><th>{tr("Учасник", "Participant")}</th><th>{tr("Диплом", "Diploma")}</th><th>{tr("Стан", "Status")}</th><th><span className="sr-only">{tr("Дії", "Actions")}</span></th></tr></thead><tbody>{shownRows.map(row => {
          const recipient = recipientById.get(row.participantId); const receives = eligibleForDiploma(row);
          return <tr key={row.participantId}><td><strong>{row.displayName}</strong><small>{recipient?.email || tr("Email не вказано", "No email address")}</small>{recipient?.certificateId && <small className="cert-certificate-id">{recipient.certificateId}</small>}</td><td><span className={`cert-award${receives ? "" : " is-muted"}`} data-place={row.awardPlace}>{diplomaLabel(row, en)}</span></td><td><span>{!receives ? row.submissionCount === 0 ? tr("Немає подач", "No submissions") : tr("Дискваліфікація", "Disqualified") : recipient?.emailSentAt ? tr("Надіслано", "Emailed") : recipient?.pdfAvailable ? tr("PDF готовий", "PDF ready") : row.isDisqualified ? tr("Участь збережена · 0 балів", "Participation retained · 0 points") : tr("До видачі", "To be issued")}</span></td><td className="cert-row-actions">{receives && <><Button variant="ghost" aria-label={tr(`Переглянути диплом: ${row.displayName}`, `Preview diploma: ${row.displayName}`)} onClick={() => { if (!draft) return; setPreviewName(row.displayName); setPreviewPlace(row.awardPlace == null ? null : String(row.awardPlace) as Place); setStep("design"); void requestPreview(draft, row.awardPlace == null ? null : String(row.awardPlace) as Place, row.participantId); }}><Eye />{tr("Перегляд", "Preview")}</Button>{recipient?.pdfAvailable && <Button variant="ghost" disabled={downloading === row.participantId} aria-label={tr(`Завантажити PDF: ${row.displayName}`, `Download PDF: ${row.displayName}`)} onClick={() => void download(row.participantId)}>{downloading === row.participantId ? <Loader2 className="animate-spin" /> : <Download />}PDF</Button>}</>}</td></tr>;
        })}</tbody></table>{!shownRows.length && <div className="cert-empty"><Users /><h3>{tr(rows.length ? "Нікого не знайдено" : "У контесті немає учасників", rows.length ? "No matches" : "No participants yet")}</h3><p>{tr(rows.length ? "Спробуй інше ім’я або зміни фільтр." : "Додай учасників і підтвердь місця після контесту.", rows.length ? "Try another name or filter." : "Add participants and confirm awards after the contest.")}</p></div>}</div>
      </div>}

      {step === "issue" && <div className="cert-issue">
        <div className="cert-section-heading"><span>03</span><div><h3>{tr("Видача дипломів", "Issue diplomas")}</h3><p>{tr("PDF з’являться тут після генерації. Надсилання поштою — окремий параметр.", "PDFs appear here after generation. Email delivery is optional.")}</p></div></div>
        <div className="cert-issue-grid"><div className="cert-preflight"><h4>{tr("Перед запуском", "Before generation")}</h4><div className={draft ? "is-ready" : ""}><CheckCircle2 /><span><strong>{tr("Макет", "Design")}</strong><small>{draft?.name || tr("Обери дизайн на першому кроці", "Choose a design in step 1")}{dirty ? tr(" · буде збережено перед запуском", " · saved before generation") : ""}</small></span></div><div className={readyAwards ? "is-ready" : ""}><CheckCircle2 /><span><strong>{tr("Розподіл місць", "Award allocation")}</strong><small>{readyAwards ? tr("Підтверджений і актуальний", "Confirmed and current") : tr("Потрібно підтвердити місця", "Confirm awards first")}</small>{!readyAwards && <button type="button" onClick={onOpenParticipants}>{tr("Перевірити місця →", "Review awards →")}</button>}</span></div><div className={eligible.length ? "is-ready" : ""}><CheckCircle2 /><span><strong>{tr("Одержувачі", "Recipients")}</strong><small>{tr(`${eligible.length} дипломів · готових PDF: ${readyPdfs}`, `${eligible.length} diplomas · PDFs ready: ${readyPdfs}`)}</small><button type="button" onClick={() => setStep("recipients")}>{tr("Переглянути список →", "View list →")}</button></span></div></div>
          <div className="cert-delivery"><h4>{tr("Параметри видачі", "Delivery settings")}</h4><label className="cert-check"><input type="checkbox" checked={sendEmail} disabled={busy} onChange={event => { setSendEmail(event.target.checked); setSettingsDirty(true); }} /><span><strong><Mail />{tr("Надіслати PDF на email", "Email the PDFs")}</strong><small>{tr("Після створення надіслати кожному його диплом.", "Send each recipient their own diploma after generation.")}</small></span></label>{sendEmail && missingEmail > 0 && <p className="cert-warning-text">{tr(`У ${missingEmail} одержувачів немає email. Їхні PDF будуть доступні для завантаження.`, `${missingEmail} recipients have no email. Their PDFs will remain available to download.`)}</p>}
          <label className="cert-check"><input type="checkbox" checked={force} disabled={busy} onChange={event => setForce(event.target.checked)} /><span><strong>{tr("Оновити вже видані дипломи", "Replace existing diplomas")}</strong><small>{tr("Створить нові PDF з поточним макетом і замінить старі коди перевірки.", "Creates new PDFs with the current design and replaces their old verification codes.")}</small></span></label><p className="cert-delivery-summary">{tr(`Буде створено PDF: ${toGenerate}.`, `PDFs to create: ${toGenerate}.`)} {sendEmail ? tr("Email-розсилку ввімкнено.", "Email delivery is enabled.") : tr("PDF можна буде завантажити зі списку.", "You can download PDFs from the recipient list.")}</p>
          <Button size="touch" disabled={busy || !readyAwards || !draft || !eligible.length || toGenerate === 0} onClick={() => void generate()}>{action || active ? <Loader2 className="animate-spin" /> : <FileCheck2 />}{active ? tr("Генерація триває…", "Generation in progress…") : tr(sendEmail ? "Згенерувати й надіслати" : "Згенерувати PDF", sendEmail ? "Generate and email" : "Generate PDFs")}</Button>
          {toEmail > 0 && <Button className="mt-3" size="touch" variant="secondary" disabled={busy || !readyAwards} onClick={() => void sendExisting()}><Mail />{tr(`Надіслати готові PDF (${toEmail})`, `Email existing PDFs (${toEmail})`)}</Button>}
          {toGenerate === 0 && readyPdfs > 0 && <p>{tr("Усі PDF уже створені. Увімкни оновлення вище, щоб застосувати новий макет.", "All PDFs already exist. Enable replacement above to apply a new design.")}</p>}</div></div>
        {generation?.batchId && <div className="cert-progress" aria-live="polite"><div><h4>{active ? tr("Створення дипломів", "Creating diplomas") : generation.status === "failed" ? tr("Потрібна увага", "Needs attention") : tr("Остання видача", "Latest generation")}</h4><span>{active ? tr(`У роботі: ${generation.pending}`, `Pending: ${generation.pending}`) : generation.status === "failed" ? tr(`Помилок: ${generation.failed}`, `Errors: ${generation.failed}`) : tr("Завершено", "Completed")}</span></div><progress max={Math.max(eligible.length, 1)} value={readyPdfs} aria-label={tr("Готові PDF", "PDFs ready")} /><p>{tr(`PDF готові: ${readyPdfs} із ${eligible.length}. Надіслано: ${emailed}.`, `PDFs ready: ${readyPdfs} of ${eligible.length}. Emailed: ${emailed}.`)}</p>{generation.errors.length > 0 && <><p className="cert-warning-text">{readableError(new Error(generation.errors[0].message))}</p><Button variant="secondary" disabled={Boolean(action) || !readyAwards} onClick={() => void retry()}><RefreshCw />{tr("Повторити невдалі завдання", "Retry failed jobs")}</Button><details><summary>{tr("Технічні подробиці", "Technical details")}</summary><ul>{generation.errors.map((item, index) => <li key={index}>{item.participantId ? `#${item.participantId} · ` : ""}{item.stage}: {item.message}</li>)}</ul></details></>}<Button variant="ghost" onClick={() => setStep("recipients")}><Download />{tr("Перейти до готових PDF", "View available PDFs")}</Button></div>}
      </div>}

      <footer className="cert-actionbar"><div>{step !== "design" ? <Button variant="ghost" onClick={() => setStep(step === "issue" ? "recipients" : "design")}><ArrowLeft />{tr("Назад", "Back")}</Button> : dirty ? <Button variant="ghost" disabled={busy} onClick={() => void load(true)}>{tr("Скасувати зміни", "Discard changes")}</Button> : <span>{tr("Зміни зберігаються кнопкою праворуч.", "Use Save to keep changes.")}</span>}</div><div><Button variant="secondary" size="touch" disabled={!draft || busy || (!dirty && workspace.settings.mode !== "none")} onClick={() => void saveDesign()}>{action === "save" ? <Loader2 className="animate-spin" /> : <Check />}{tr("Зберегти", "Save")}</Button>{step !== "issue" && <Button size="touch" disabled={!draft} onClick={() => setStep(step === "design" ? "recipients" : "issue")}>{tr(step === "design" ? "До одержувачів" : "До видачі", step === "design" ? "Review recipients" : "Prepare issue")}<ArrowRight /></Button>}</div></footer>
    </>}
  </section>;
}
