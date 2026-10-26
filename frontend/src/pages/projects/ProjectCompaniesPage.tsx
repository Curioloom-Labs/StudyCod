import React from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardCheck, Code2, Plus, UserRoundPlus } from "lucide-react";
import { TalentWorkspaceShell } from "../../components/layout/TalentWorkspaceShell";
import { TalentDashboard } from "./TalentDashboard";
import { TalentInterviewsHub } from "./TalentInterviewsHub";
import { TalentEvidenceComparison, TalentEvidenceFiles, TalentJourney } from "./TalentEvidence";
import { normalizeTalentCompany, talentView, type TalentView } from "./companyWorkspace";
import {
  assignCompanyTechnicalTask, createProjectCompany, getCandidateCompanyAssessment, getCandidateCompanyPortfolioOptions,
  getCompanyAssessment, getProjectCompanies, getProjectCompany, inviteCompanyCandidate, inviteCompanyMember,
  respondCandidateCompanyAssessment, respondCompanyMembership, saveCandidateCompanyAnswers,
  selectCandidateCompanyPortfolio, submitCompanyInterviewReview, submitCompanyTechnicalReview,
  withdrawCandidateCompanyAssessment, type CompanyCaseReview,
} from "../../lib/api/projectCompanies";
import { useTranslation } from "react-i18next";

const panel = "talent-panel";
const field = "talent-field";
const primary = "talent-button talent-button--primary";
const secondary = "talent-button";
const statusLabel: Record<string, [string, string]> = {
  INVITED: ["Очікує відповіді", "Awaiting response"], ACCEPTED: ["Згоду надано", "Consent given"],
  PORTFOLIO_SELECTED: ["Версію обрано", "Version selected"], TASK_ASSIGNED: ["Технічне завдання", "Technical task"],
  TASK_SUBMITTED: ["Завдання подано", "Task submitted"], REVIEWED: ["Рецензію завершено", "Review complete"],
  DECLINED: ["Запрошення відхилено", "Invitation declined"], WITHDRAWN: ["Участь відкликано", "Participation withdrawn"],
  CLOSED: ["Закрито", "Closed"],
};
const emptyReview = (): CompanyCaseReview => ({ scores: [0, 0, 0], comment: "", recommendation: "READY_TO_CONTINUE" });

export const ProjectCompaniesPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [params, setParams] = useSearchParams();
  const [dashboard, setDashboard] = React.useState<{ companies: Array<Record<string, any>>; pendingMemberships: Array<Record<string, any>>; candidateCases: Array<Record<string, any>> } | null>(null);
  const [company, setCompany] = React.useState<Record<string, any> | null>(null);
  const [caseView, setCaseView] = React.useState<Record<string, any> | null>(null);
  const [caseRole, setCaseRole] = React.useState<"OWNER" | "HR" | "ENGINEER" | null>(null);
  const [portfolioOptions, setPortfolioOptions] = React.useState<Array<Record<string, any>>>([]);
  const [selectedVersion, setSelectedVersion] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [hrReview, setHrReview] = React.useState<CompanyCaseReview>(emptyReview);
  const [techReview, setTechReview] = React.useState<CompanyCaseReview>(emptyReview);
  const [companyName, setCompanyName] = React.useState("");
  const [memberUsername, setMemberUsername] = React.useState("");
  const [memberRole, setMemberRole] = React.useState<"HR" | "ENGINEER">("HR");
  const [candidateUsername, setCandidateUsername] = React.useState("");
  const [roleTitle, setRoleTitle] = React.useState("");
  const [introduction, setIntroduction] = React.useState("");
  const [questionOne, setQuestionOne] = React.useState("");
  const [questionTwo, setQuestionTwo] = React.useState("");
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskPrompt, setTaskPrompt] = React.useState("");
  const [publicInput, setPublicInput] = React.useState("");
  const [publicOutput, setPublicOutput] = React.useState("");
  const [hiddenInput, setHiddenInput] = React.useState("");
  const [hiddenOutput, setHiddenOutput] = React.useState("");
  const [consentChecked, setConsentChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const companyId = params.get("company");
  const assessmentId = params.get("assessment");
  const candidateCaseId = params.get("case");
  const view = talentView(params.get("view"));
  const creating = params.get("new") === "company";
  const [dossierTab, setDossierTab] = React.useState("interview");
  const currentRoute = React.useRef({ companyId, assessmentId, candidateCaseId });
  currentRoute.current = { companyId, assessmentId, candidateCaseId };

  const refreshDashboard = React.useCallback(async () => setDashboard(await getProjectCompanies()), []);
  const refreshCompany = React.useCallback(async (id: string) => {
    const data = await getProjectCompany(id);
    if (currentRoute.current.companyId === id) setCompany(normalizeTalentCompany(data));
  }, []);
  const refreshCandidateCase = React.useCallback(async (id: string) => {
    const next = await getCandidateCompanyAssessment(id);
    if (currentRoute.current.candidateCaseId !== id) return;
    setCaseView(next);
    setAnswers(Object.fromEntries((next.questions ?? []).map((question: any) => [question.id, (next.answers ?? []).find((answer: any) => answer.questionId === question.id)?.answer ?? ""])));
    if (["ACCEPTED", "PORTFOLIO_SELECTED"].includes(next.status)) {
      const versions = await getCandidateCompanyPortfolioOptions(id);
      if (currentRoute.current.candidateCaseId === id) setPortfolioOptions(versions);
    } else setPortfolioOptions([]);
  }, []);
  const refreshCompanyCase = React.useCallback(async (cid: string, id: string) => {
    const result = await getCompanyAssessment(cid, id);
    if (currentRoute.current.companyId !== cid || currentRoute.current.assessmentId !== id) return;
    setCaseRole(result.role); setCaseView(result.assessment);
    setHrReview(result.assessment.hrReview ? { scores: result.assessment.hrReview.scores ?? [0, 0, 0], comment: result.assessment.hrReview.comment ?? "", recommendation: result.assessment.hrReview.recommendation ?? "READY_TO_CONTINUE" } : emptyReview());
    setTechReview(result.assessment.technicalReview ? { scores: result.assessment.technicalReview.scores ?? [0, 0, 0], comment: result.assessment.technicalReview.comment ?? "", recommendation: result.assessment.technicalReview.recommendation ?? "READY_TO_CONTINUE" } : emptyReview());
  }, []);

  React.useEffect(() => { void refreshDashboard().catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not load company workspace" : "Не вдалося завантажити простір компанії")))); }, [refreshDashboard, en]);
  React.useEffect(() => {
    if (!companyId) { setCompany(null); return; }
    setCompany(null); setError("");
    void refreshCompany(companyId).catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not open company" : "Не вдалося відкрити компанію"))));
  }, [companyId, refreshCompany, en]);
  React.useEffect(() => {
    if (!candidateCaseId) return;
    setCaseRole(null); setCaseView(null); setConsentChecked(false); setError("");
    void refreshCandidateCase(candidateCaseId).catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not open invitation" : "Не вдалося відкрити запрошення"))));
  }, [candidateCaseId, refreshCandidateCase, en]);
  React.useEffect(() => {
    if (!assessmentId || !companyId) return;
    setCaseRole(null); setCaseView(null); setError("");
    void refreshCompanyCase(companyId, assessmentId).catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not load assessment" : "Не вдалося завантажити оцінювання"))));
  }, [assessmentId, companyId, refreshCompanyCase, en]);
  React.useEffect(() => { setDossierTab(caseRole === "ENGINEER" ? "task" : "interview"); }, [assessmentId, caseRole]);
  React.useEffect(() => { setTaskTitle(""); setTaskPrompt(""); setPublicInput(""); setPublicOutput(""); setHiddenInput(""); setHiddenOutput(""); }, [assessmentId, companyId]);

  const report = (message: string) => { setNotice(message); setError(""); };
  const fail = (err: any, fallback: string) => setError(String(err?.response?.data?.message ?? err?.response?.data?.code ?? fallback));
  const run = async (action: () => Promise<unknown>, successMessage: string, after?: () => Promise<unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (after) await after(); report(successMessage); }
    catch (err) { fail(err, en ? "Action failed" : "Не вдалося виконати дію"); }
    finally { setBusy(false); }
  };

  const createCompany = () => run(async () => {
    const result = await createProjectCompany(companyName);
    setParams({ company: result.id, view: "interviews" }); setCompanyName("");
    await refreshDashboard();
  }, en ? "Company workspace created." : "Простір компанії створено.");

  const respondMembership = (id: string, decision: "ACCEPT" | "DECLINE") => run(() => respondCompanyMembership(id, decision), en ? "Invitation updated." : "Запрошення оновлено.", refreshDashboard);

  const sendMemberInvite = () => companyId && run(async () => {
    await inviteCompanyMember(companyId, memberUsername, memberRole);
    setMemberUsername(""); await refreshCompany(companyId); await refreshDashboard();
  }, en ? "Team invitation sent." : "Запрошення команді надіслано.");

  const sendCandidateInvite = () => companyId && run(async () => {
    const key = crypto.randomUUID();
    await inviteCompanyCandidate(companyId, {
      candidateUsername, roleTitle, introduction,
      questions: [{ id: "q1", text: questionOne }, { id: "q2", text: questionTwo }], idempotencyKey: key,
    });
    setCandidateUsername(""); setRoleTitle(""); setIntroduction(""); setQuestionOne(""); setQuestionTwo("");
    await refreshCompany(companyId); await refreshDashboard();
  }, en ? "Candidate invitation sent." : "Запрошення кандидату надіслано.");

  const chooseCandidateVersion = () => {
    const item = portfolioOptions.find(version => version.versionId === selectedVersion);
    if (!item || !candidateCaseId) return;
    void run(() => selectCandidateCompanyPortfolio(candidateCaseId, item.projectId, item.versionId), en ? "Project version shared with the company." : "Версію проєкту передано компанії.", () => refreshCandidateCase(candidateCaseId));
  };

  const saveAnswers = () => candidateCaseId && run(
    () => saveCandidateCompanyAnswers(candidateCaseId, (caseView?.questions ?? []).map((question: any) => ({ questionId: question.id, answer: answers[question.id] ?? "" }))),
    en ? "Interview answers saved." : "Відповіді збережено.", () => refreshCandidateCase(candidateCaseId),
  );

  const withdraw = () => candidateCaseId && run(async () => {
    await withdrawCandidateCompanyAssessment(candidateCaseId); setCaseView(null); setParams({}); await refreshDashboard();
  }, en ? "Participation withdrawn." : "Участь відкликано.");

  const submitInterviewReview = () => companyId && assessmentId && run(
    () => submitCompanyInterviewReview(companyId, assessmentId, hrReview),
    en ? "HR review saved." : "Відгук HR збережено.", () => refreshCompanyCase(companyId, assessmentId),
  );
  const submitTechnicalReview = () => companyId && assessmentId && run(
    () => submitCompanyTechnicalReview(companyId, assessmentId, techReview),
    en ? "Engineering review saved." : "Відгук інженера збережено.", () => refreshCompanyCase(companyId, assessmentId),
  );

  const assignTask = () => companyId && assessmentId && run(async () => {
    await assignCompanyTechnicalTask(companyId, assessmentId, {
      title: taskTitle, prompt: taskPrompt,
      tests: [
        { input: publicInput, output: publicOutput, group: "public-example", hidden: false },
        { input: hiddenInput, output: hiddenOutput, group: "requirement-change", hidden: true },
      ], idempotencyKey: crypto.randomUUID(),
    });
    await refreshCompanyCase(companyId, assessmentId); await refreshCompany(companyId);
  }, en ? "Technical task assigned." : "Технічне завдання призначено.");

  const visitCandidateCase = (id: string) => { setCaseView(null); setParams({ case: id }); };
  const visitCompanyCase = (id: string) => { if (companyId) { setCaseView(null); setParams({ company: companyId, assessment: id }); } };
  const changeView = (next: TalentView) => { if (companyId) { setCaseView(null); setParams({ company: companyId, view: next }); } };
  const dossierTabs = [
    ...(["OWNER", "HR"].includes(caseRole ?? "") ? [["interview", en ? "Interview" : "Співбесіда"]] : []),
    ["portfolio", en ? "Original version" : "Вихідна версія"],
    ...(["OWNER", "ENGINEER"].includes(caseRole ?? "") ? [["task", en ? "Requirement change" : "Зміна вимог"]] : []),
    ...(["OWNER", "ENGINEER"].includes(caseRole ?? "") ? [["changes", en ? "Compare changes" : "Порівняти зміни"]] : []),
    ["feedback", en ? "Feedback" : "Відгуки"],
  ];
  const scoreLabels = en ? ["Understanding requirements", "Reasoning and design", "Code quality and tests"] : ["Розуміння вимог", "Обґрунтування рішення", "Якість коду й перевірок"];
  const reviewForm = (value: CompanyCaseReview, setValue: React.Dispatch<React.SetStateAction<CompanyCaseReview>>, label: string, submit: () => void, canSubmit: boolean) => <section className={panel}>
    <h3 className="font-bold">{label}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">{scoreLabels.map((item, index) => <label key={item} className="text-xs font-semibold">{item}<select value={value.scores[index] ?? 0} onChange={event => setValue(old => ({ ...old, scores: old.scores.map((score, current) => current === index ? Number(event.target.value) : score) }))} className={field}>{[0, 1, 2, 3].map(score => <option value={score} key={score}>{score} / 3</option>)}</select></label>)}</div>
    <label className="mt-3 block text-sm font-semibold">{en ? "Feedback" : "Коментар"}<textarea rows={3} maxLength={6000} value={value.comment} onChange={event => setValue(old => ({ ...old, comment: event.target.value }))} className={field} /></label>
    <label className="mt-3 block text-sm font-semibold">{en ? "Recommendation" : "Рекомендація"}<select value={value.recommendation} onChange={event => setValue(old => ({ ...old, recommendation: event.target.value as CompanyCaseReview["recommendation"] }))} className={field}><option value="READY_TO_CONTINUE">{en ? "Ready to continue" : "Можна продовжувати"}</option><option value="NEEDS_WORK">{en ? "Needs more work" : "Варто доопрацювати"}</option></select></label>
    <button type="button" disabled={busy || !canSubmit} onClick={submit} className={`${primary} mt-4`}><ClipboardCheck className="h-4 w-4" />{en ? "Save review" : "Зберегти відгук"}</button>
    <p className="mt-2 text-xs leading-5 text-text-muted">{en ? "This is structured feedback for learning and discussion, not an automated hiring score." : "Це структурований відгук для навчання й обговорення, а не автоматична оцінка кандидата для найму."}</p>
  </section>;

  const companyForm = <form onSubmit={event => { event.preventDefault(); void createCompany(); }}><label className="talent-form-label">{en ? "Company name" : "Назва компанії"}<input value={companyName} onChange={event => setCompanyName(event.target.value)} required minLength={2} maxLength={160} autoComplete="organization" placeholder={en ? "Your company" : "Твоя компанія"} className={field}/></label><button disabled={busy || companyName.trim().length < 2} className={`${primary} mt-4 w-full`} type="submit"><Plus size={16}/>{en ? "Create workspace" : "Створити робочий простір"}</button><p className="talent-form-hint">{en ? "You will be the owner. Team members join by invitation." : "Ти станеш власником. Учасники команди приєднаються за запрошеннями."}</p></form>;
  const memberForm = <form onSubmit={event => { event.preventDefault(); void sendMemberInvite(); }} className="talent-form-grid"><label className="talent-form-label">{en ? "Registered username" : "Username зареєстрованого користувача"}<input value={memberUsername} onChange={event => setMemberUsername(event.target.value)} required maxLength={80} className={field}/></label><label className="talent-form-label">{en ? "Responsibility" : "Відповідальність"}<select value={memberRole} onChange={event => setMemberRole(event.target.value as "HR" | "ENGINEER")} className={field}><option value="HR">{en ? "HR · invitations and interviews" : "HR · запрошення та співбесіди"}</option><option value="ENGINEER">{en ? "Engineer · tasks and code review" : "Інженер · задачі та розгляд коду"}</option></select></label><div className="talent-form-full"><button type="submit" disabled={busy || !memberUsername.trim()} className={primary}><UserRoundPlus size={16}/>{en ? "Send team invitation" : "Надіслати запрошення в команду"}</button></div></form>;
  const candidateForm = <form onSubmit={event => { event.preventDefault(); void sendCandidateInvite(); }} className="talent-form-grid"><label className="talent-form-label">{en ? "Candidate username" : "Username кандидата"}<input value={candidateUsername} onChange={event => setCandidateUsername(event.target.value)} required maxLength={80} className={field}/></label><label className="talent-form-label">{en ? "Role you want to discuss" : "Роль, яку хочете обговорити"}<input value={roleTitle} onChange={event => setRoleTitle(event.target.value)} required minLength={2} maxLength={160} placeholder={en ? "Python developer" : "Python-розробник"} className={field}/></label><label className="talent-form-label talent-form-full">{en ? "What should the candidate expect?" : "Що очікує на кандидата?"}<textarea rows={3} value={introduction} onChange={event => setIntroduction(event.target.value)} required minLength={10} maxLength={4000} placeholder={en ? "Explain the role, the conversation and the technical task." : "Опиши роль, формат розмови й технічного завдання."} className={field}/></label><label className="talent-form-label">{en ? "Interview question 1" : "Запитання співбесіди 1"}<textarea rows={3} value={questionOne} onChange={event => setQuestionOne(event.target.value)} required minLength={3} maxLength={500} className={field}/></label><label className="talent-form-label">{en ? "Interview question 2" : "Запитання співбесіди 2"}<textarea rows={3} value={questionTwo} onChange={event => setQuestionTwo(event.target.value)} required minLength={3} maxLength={500} className={field}/></label><div className="talent-form-full"><button type="submit" disabled={busy || !candidateUsername.trim() || roleTitle.trim().length < 2 || introduction.trim().length < 10 || questionOne.trim().length < 3 || questionTwo.trim().length < 3} className={primary}><UserRoundPlus size={16}/>{en ? "Send candidate invitation" : "Надіслати запрошення кандидату"}</button><p className="talent-form-hint">{en ? "The candidate decides whether to participate and which project version to share." : "Кандидат сам вирішує, чи брати участь і яку версію проєкту передати."}</p></div></form>;
  const context = <><div className="talent-context"><span className="talent-context__avatar">{company?.name?.slice(0, 1).toUpperCase() ?? "T"}</span><div><label htmlFor="talent-workspace-picker">{candidateCaseId ? (en ? "Candidate workspace" : "Простір кандидата") : (en ? "Company workspace" : "Робочий простір компанії")}</label><select id="talent-workspace-picker" value={creating ? "__new" : companyId ?? ""} onChange={event => { setCaseView(null); const value = event.target.value; setParams(value === "__new" ? { new: "company" } : value ? { company: value, view: "interviews" } : {}); }}><option value="">{en ? "My workspaces" : "Мої робочі простори"}</option>{dashboard?.companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ {en ? "Create a company" : "Створити компанію"}</option></select></div></div><span className="talent-context-note"><Code2 size={15}/>{en ? "Interviews & development" : "Співбесіди й розвиток"}</span></>;
  const navigation = <nav className="talent-nav" aria-label={en ? "Talent workspace" : "Розділи Talent"}>{companyId ? (["interviews", "candidates", "kits", "team"] as TalentView[]).map(tab => <button key={tab} type="button" aria-current={(assessmentId || view === "assessments" || view === "overview" ? tab === "candidates" : view === tab) ? "page" : undefined} onClick={() => changeView(tab)}>{({ interviews: en ? "Interviews" : "Співбесіди", kits: en ? "Kits & tests" : "Комплекти й тести", overview: en ? "Overview" : "Огляд", candidates: en ? "Candidates" : "Кандидати", assessments: en ? "Technical assessments" : "Технічні оцінювання", team: en ? "Team" : "Команда" })[tab]}{tab === "candidates" && !!company?.assessments?.length && <span className="talent-nav__count">{company.assessments.length}</span>}</button>) : <><button type="button" aria-current={!candidateCaseId && params.get("view") !== "invitations" ? "page" : undefined} onClick={() => { setCaseView(null); setParams({}); }}>{en ? "Workspaces" : "Робочі простори"}</button><button type="button" aria-current={candidateCaseId || params.get("view") === "invitations" ? "page" : undefined} onClick={() => { setCaseView(null); setParams({ view: "invitations" }); }}>{en ? "My invitations" : "Мої запрошення"}{!!dashboard?.candidateCases.length && <span className="talent-nav__count">{dashboard.candidateCases.length}</span>}</button></>}</nav>;

  return <TalentWorkspaceShell context={context} navigation={navigation}><main id="main-content" className="talent-main">
    {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-5 rounded-lg border p-3 text-sm ${error ? "border-accent-warn/40 bg-accent-warn/5" : "border-primary/30 bg-primary/5"}`}>{error || notice}</div>}
    {(candidateCaseId || assessmentId) && !caseView && !error && <div className="talent-loading" role="status"><span className="talent-skeleton talent-skeleton--title"/><span className="talent-skeleton talent-skeleton--row"/><span className="talent-skeleton talent-skeleton--row"/><span className="sr-only">{en ? "Loading dossier" : "Завантажується досьє"}</span></div>}
    {candidateCaseId && caseView && !caseRole ? <section className="space-y-4">
      <button type="button" onClick={() => { setParams({ view: "invitations" }); setCaseView(null); }} className="talent-text-button"><ArrowLeft size={15}/>{en ? "My invitations" : "Мої запрошення"}</button>
      <TalentJourney assessment={caseView} en={en}/>
      <article className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary-soft">{caseView.companyName}</p><h2 className="mt-1 text-2xl font-bold">{caseView.roleTitle}</h2></div><span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold">{statusLabel[caseView.status]?.[en ? 1 : 0] ?? caseView.status}</span></div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.introduction}</p>
        {caseView.status === "INVITED" && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consentChecked} onChange={event => setConsentChecked(event.target.checked)} className="mt-1" /><span>{en ? "I agree to share my answers and the specific project version I choose with this company for this assessment. I can withdraw later." : "Я погоджуюся передати цій компанії свої відповіді та конкретну вибрану версію проєкту для цього оцінювання. Я можу відкликати згоду пізніше."}</span></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!consentChecked || busy} onClick={() => void run(() => respondCandidateCompanyAssessment(caseView.id, "ACCEPT"), en ? "Consent saved." : "Згоду збережено.", () => refreshCandidateCase(caseView.id))} className={primary}><Check className="h-4 w-4" />{en ? "Agree and continue" : "Погодитися й продовжити"}</button><button type="button" disabled={busy} onClick={() => void run(() => respondCandidateCompanyAssessment(caseView.id, "DECLINE"), en ? "Invitation declined." : "Запрошення відхилено.", refreshDashboard)} className={secondary}>{en ? "Decline" : "Відхилити"}</button></div></div>}
        {["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].includes(caseView.status) && <>
          <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Interview questions" : "Запитання співбесіди"}</h3><div className="mt-3 space-y-3">{(caseView.questions ?? []).map((question: any, index: number) => <label key={question.id} className="block text-sm font-semibold">{index + 1}. {question.text}<textarea rows={3} maxLength={6000} readOnly={Boolean(caseView.hrReview)} value={answers[question.id] ?? ""} onChange={event => setAnswers(old => ({ ...old, [question.id]: event.target.value }))} className={field} /></label>)}</div><button type="button" disabled={busy || Boolean(caseView.hrReview)} onClick={() => void saveAnswers()} className={`${secondary} mt-3`}>{en ? "Save answers" : "Зберегти відповіді"}</button>{caseView.hrReview && <p className="mt-2 text-xs text-text-muted">{en ? "Answers are frozen after HR submits a review." : "Відповіді зафіксовано після відгуку HR."}</p>}</section>
          {caseView.status === "ACCEPTED" && <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Choose project evidence" : "Обери проєкт як доказ роботи"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "The company receives only this frozen version. Changes made for a technical task are kept in a separate copy." : "Компанія отримає лише цю зафіксовану версію. Зміни для технічного завдання будуть окремою копією."}</p><select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)} className={field}><option value="">{en ? "Select a saved version" : "Вибери збережену версію"}</option>{portfolioOptions.map(item => <option key={item.versionId} value={item.versionId}>{item.family} · {item.runtime} · {item.stage} #{item.sequence}</option>)}</select><button type="button" disabled={busy || !selectedVersion} onClick={chooseCandidateVersion} className={`${primary} mt-3`}>{en ? "Share this version" : "Передати цю версію"}</button>{portfolioOptions.length === 0 && <p className="mt-2 text-xs text-text-muted">{en ? "No supported frozen project versions are available yet. Build one in Projects first." : "Поки немає доступних зафіксованих версій. Спочатку створи її в розділі «Проєкти»."}</p>}</section>}
          {caseView.status === "PORTFOLIO_SELECTED" && <p className="mt-4 rounded-xl bg-bg-base p-3 text-sm text-text-secondary">{en ? "Your selected version is shared. The engineering team may now add a short task." : "Обрану версію передано. Технічна команда може призначити коротке завдання."}</p>}
          {caseView.status === "TASK_ASSIGNED" && caseView.task && <section className="mt-5 border-t border-border pt-4"><h3 className="text-lg font-bold">{caseView.task.card?.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.task.card?.prompt}</p><div className="mt-3 rounded-xl bg-bg-base p-3 text-sm text-text-secondary">{en ? "Built-in AI is disabled. Documentation is allowed. The platform cannot verify whether outside help was used." : "Вбудований AI вимкнений. Документацією користуватися можна. Платформа не може підтвердити відсутність зовнішньої допомоги."}</div><button type="button" onClick={() => window.location.assign(`/projects?project=${encodeURIComponent(caseView.projectId)}`)} className={`${primary} mt-4`}><Code2 className="h-4 w-4" />{en ? "Open task workspace" : "Відкрити робоче місце задачі"}</button><p className="mt-2 text-xs text-text-muted">{en ? "The task uses the shared Judge queue; closing this page will not cancel an accepted check." : "Задача використовує спільну чергу Judge; закриття сторінки не скасує прийняту перевірку."}</p></section>}
          {caseView.status === "TASK_SUBMITTED" && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{en ? "Your submission is with the engineering reviewer." : "Твою роботу передано інженерному рецензенту."}{caseView.technicalReview && <p className="mt-2">{caseView.technicalReview.comment}</p>}</div>}
          {caseView.status === "REVIEWED" && <div className="mt-4 space-y-2">{caseView.hrReview && <div className="rounded-xl bg-bg-base p-3 text-sm"><strong>{en ? "HR feedback" : "Відгук HR"}</strong><p className="mt-1 text-text-secondary">{caseView.hrReview.comment}</p></div>}{caseView.technicalReview && <div className="rounded-xl bg-bg-base p-3 text-sm"><strong>{en ? "Engineering feedback" : "Відгук інженера"}</strong><p className="mt-1 text-text-secondary">{caseView.technicalReview.comment}</p></div>}</div>}
        </>}
        {caseView.status !== "WITHDRAWN" && caseView.status !== "DECLINED" && <button type="button" disabled={busy} onClick={withdraw} className="mt-6 text-xs font-semibold text-text-muted underline">{en ? "Withdraw consent and participation" : "Відкликати згоду та участь"}</button>}
      </article>
    </section> : null}

    {assessmentId && companyId && caseView && caseRole ? <section className="space-y-4">
      <button type="button" onClick={() => { setParams({ company: companyId, view: "candidates" }); setCaseView(null); }} className="talent-text-button"><ArrowLeft size={15}/>{en ? "All candidates" : "Усі кандидати"}</button>
      <header><span className="talent-eyebrow">{en ? "Candidate dossier" : "Досьє кандидата"}</span><div className="talent-dossier-heading"><span className="talent-person__initial">{String(caseView.candidateUsername ?? "?").slice(0, 1).toUpperCase()}</span><div><h1>{caseView.candidateUsername}</h1><p>{caseView.roleTitle}</p></div><span className="talent-status ml-auto" data-status={caseView.status}>{statusLabel[caseView.status]?.[en ? 1 : 0] ?? caseView.status}</span></div><TalentJourney assessment={caseView} en={en}/>{!["DECLINED", "WITHDRAWN", "CLOSED"].includes(caseView.status) && <button type="button" className="talent-button mt-4" onClick={() => setParams({ company: companyId!, view: "interviews", scheduleFor: assessmentId! })}>{en ? "Schedule interview with this candidate" : "Запланувати співбесіду з цим кандидатом"}</button>}</header>
      {caseView.status !== "WITHDRAWN" && <nav className="talent-dossier-tabs" aria-label={en ? "Candidate evidence" : "Матеріали кандидата"}>{dossierTabs.map(([tab, label]) => <button key={tab} type="button" aria-pressed={dossierTab === tab} onClick={() => setDossierTab(tab)}>{label}</button>)}</nav>}
      {dossierTab === "portfolio" && !caseView.portfolio && caseView.status !== "WITHDRAWN" && <div className="talent-panel talent-empty"><h3>{en ? "The candidate has not shared a version yet" : "Кандидат ще не передав версію"}</h3><p>{en ? "Project code becomes available when the candidate selects a saved version after giving consent." : "Код проєкту стане доступним, коли кандидат надасть згоду й обере збережену версію."}</p></div>}
      {dossierTab === "task" && !caseView.task && caseView.status !== "PORTFOLIO_SELECTED" && caseView.status !== "WITHDRAWN" && <div className="talent-panel talent-empty"><Code2 size={25}/><h3>{en ? "A project version comes first" : "Спочатку потрібна версія проєкту"}</h3><p>{en ? "The engineer prepares a requirement change on the specific version selected by the candidate." : "Інженер підготує зміну вимог до конкретної версії, яку вибере кандидат."}</p></div>}
      {dossierTab === "feedback" && caseRole === "ENGINEER" && !["PASSED", "FAILED"].includes(caseView.task?.status) && caseView.status !== "WITHDRAWN" && <div className="talent-panel talent-empty"><ClipboardCheck size={25}/><h3>{en ? "Review follows the submission" : "Відгук після подання роботи"}</h3><p>{en ? "The candidate will explicitly submit a frozen working copy and its checks. You can then review the code and reasoning together." : "Кандидат явно подасть зафіксовану робочу копію з перевіркою. Після цього ти зможеш розглянути код і пояснення разом."}</p></div>}
      {dossierTab === "interview" && (caseRole === "OWNER" || caseRole === "HR") && caseView.status !== "WITHDRAWN" && <article className={panel}><h3 className="font-bold">{en ? "Candidate interview answers" : "Відповіді кандидата"}</h3>{(caseView.questions ?? []).map((question: any) => <div key={question.id} className="mt-3 rounded-xl bg-bg-base p-3"><p className="text-xs font-bold text-text-muted">{question.text}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{(caseView.answers ?? []).find((answer: any) => answer.questionId === question.id)?.answer || (en ? "No answer yet" : "Відповіді ще немає")}</p></div>)}</article>}
      {dossierTab === "portfolio" && caseView.portfolio && caseView.status !== "WITHDRAWN" && <article className={panel}><h3 className="font-bold">{en ? "Candidate's frozen portfolio version" : "Зафіксована версія портфоліо кандидата"}</h3><p className="mt-1 text-sm text-text-secondary">{caseView.portfolio.family} · {caseView.portfolio.runtime} · {caseView.portfolio.stage} #{caseView.portfolio.sequence}</p><TalentEvidenceFiles files={caseView.portfolio.files ?? []} /></article>}
      {dossierTab === "task" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.status === "PORTFOLIO_SELECTED" && <article className={panel}><h3 className="font-bold">{en ? "Assign a short engineering task" : "Призначити коротке технічне завдання"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "The candidate starts from a copy of the selected version. Include a public example and a hidden regression check." : "Кандидат почне з копії обраної версії. Додай публічний приклад і приховану регресійну перевірку."}</p><label className="mt-3 block text-sm font-semibold">{en ? "Task title" : "Назва задачі"}<input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} className={field} /></label><label className="mt-3 block text-sm font-semibold">{en ? "Requirement" : "Умова"}<textarea rows={4} value={taskPrompt} onChange={event => setTaskPrompt(event.target.value)} className={field} /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><strong className="text-sm">{en ? "Public example" : "Публічний приклад"}</strong><textarea aria-label="Public input" rows={2} placeholder={en ? "Input" : "Ввід"} value={publicInput} onChange={event => setPublicInput(event.target.value)} className={field} /><textarea aria-label="Public output" rows={2} placeholder={en ? "Expected output" : "Очікуваний вивід"} value={publicOutput} onChange={event => setPublicOutput(event.target.value)} className={field} /></div><div className="rounded-xl border border-border p-3"><strong className="text-sm">{en ? "Hidden regression check" : "Прихована регресійна перевірка"}</strong><textarea aria-label="Hidden input" rows={2} placeholder={en ? "Input" : "Ввід"} value={hiddenInput} onChange={event => setHiddenInput(event.target.value)} className={field} /><textarea aria-label="Hidden output" rows={2} placeholder={en ? "Expected output" : "Очікуваний вивід"} value={hiddenOutput} onChange={event => setHiddenOutput(event.target.value)} className={field} /></div></div><button type="button" disabled={busy || !taskTitle.trim() || !taskPrompt.trim() || !publicInput || !hiddenInput} onClick={assignTask} className={`${primary} mt-4`}><Plus className="h-4 w-4" />{en ? "Assign task" : "Призначити задачу"}</button></article>}
      {dossierTab === "task" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.task && <article className={panel}><h3 className="font-bold">{en ? "Technical task result" : "Результат технічного завдання"}</h3><p className="mt-1 text-sm text-text-secondary">{caseView.task.title} · {caseView.task.status} · {caseView.task.executionState ?? (en ? "not checked" : "ще не перевірено")}</p>{caseView.task.result && <p className="mt-2 text-sm">{caseView.task.result.testsPassed}/{caseView.task.result.testsTotal} {en ? "tests passed" : "тестів пройдено"}</p>}{caseView.task.explanation && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.task.explanation}</p>}{caseView.task.files?.length > 0 && <TalentEvidenceFiles files={caseView.task.files ?? []} />}</article>}
      {dossierTab === "feedback" && (caseRole === "OWNER" || caseRole === "HR") && caseView.status !== "WITHDRAWN" && reviewForm(hrReview, setHrReview, en ? "HR interview review" : "Відгук HR за співбесідою", submitInterviewReview, ["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].includes(caseView.status))}
      {dossierTab === "feedback" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.status !== "WITHDRAWN" && caseView.task?.status && ["PASSED", "FAILED"].includes(caseView.task.status) && reviewForm(techReview, setTechReview, en ? "Engineering task review" : "Відгук інженера за технічним завданням", submitTechnicalReview, true)}
      {dossierTab === "changes" && caseView.status !== "WITHDRAWN" && (caseView.portfolio?.files && caseView.task?.files?.length
        ? <TalentEvidenceComparison before={caseView.portfolio.files} after={caseView.task.files} en={en}/>
        : <div className="talent-panel talent-empty"><Code2 size={25}/><h3>{en ? "Compare after the candidate submits" : "Порівняння після подання роботи"}</h3><p>{en ? "The original version and explicitly submitted files will appear side by side here." : "Тут з’являться поруч вихідна версія та файли, які кандидат явно подав на розгляд."}</p></div>)}
      {caseView.status === "WITHDRAWN" && <p className="rounded-xl border border-accent-warn/30 bg-accent-warn/5 p-4 text-sm">{en ? "The candidate withdrew consent. Private answers and work are no longer available." : "Кандидат відкликав згоду. Приватні відповіді та роботи недоступні."}</p>}
    </section> : null}

    {!candidateCaseId && !assessmentId && !companyId && !creating && <TalentInterviewsHub en={en} compact/>}
    {!candidateCaseId && !assessmentId && company?.id === companyId && (view === "interviews" || view === "kits") && <TalentInterviewsHub key={companyId!} en={en} company={company} library={view === "kits"} initialCaseId={params.get("scheduleFor") ?? undefined}/>}
    {!candidateCaseId && !assessmentId && companyId && (view === "candidates" || view === "assessments" || view === "overview") && <div className="flex flex-wrap gap-3 mb-5"><button type="button" className="talent-text-button" onClick={() => changeView("candidates")}>{en ? "Candidate dossiers" : "Досьє кандидатів"}</button><button type="button" className="talent-text-button" onClick={() => changeView("assessments")}>{en ? "Project tasks" : "Завдання до проєктів"}</button><button type="button" className="talent-text-button" onClick={() => changeView("overview")}>{en ? "Process overview" : "Огляд процесу"}</button></div>}
    {!candidateCaseId && !assessmentId && (!companyId || (view !== "interviews" && view !== "kits")) && <TalentDashboard en={en} dashboard={dashboard} company={company} loading={Boolean(companyId && company?.id !== companyId && !error)} view={view} inboxOnly={params.get("view") === "invitations"} creating={creating} busy={busy} companyForm={companyForm} memberForm={memberForm} candidateForm={candidateForm} openCompany={id => setParams({ company: id, view: "interviews" })} openCandidateCase={visitCandidateCase} openCompanyCase={visitCompanyCase} changeView={changeView} respondMembership={(id, decision) => void respondMembership(id, decision)} labelStatus={status => statusLabel[status]?.[en ? 1 : 0] ?? status}/>}
  </main></TalentWorkspaceShell>;
};
