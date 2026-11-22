import React from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardCheck, Code2, Plus, UserRoundPlus } from "lucide-react";
import { AssessWorkspaceShell } from "../../components/layout/AssessWorkspaceShell";
import { AssessDashboard } from "./AssessDashboard";
import { AssessIntegrationsPanel } from "./AssessIntegrationsPanel";
import { AssessInterviewsHub } from "./AssessInterviewsHub";
import { AssessEvidenceComparison, AssessEvidenceFiles, AssessJourney } from "./AssessEvidence";
import { assessRoleCaseTemplates, assessRoleProfiles, type AssessRoleProfileKey } from "./assessRoleRubrics";
import { normalizeAssessCompany, assessView, type AssessView } from "./assessWorkspace";
import {
  assignAssessTechnicalTask, createAssessCompany, getAssessCandidateAssessment, getAssessCandidatePortfolioOptions,
  getAssessCompanyAssessment, getAssessCompanies, getAssessCompany, inviteAssessCandidate, inviteAssessCompanyMember,
  revokeAssessCompanyMember, updateAssessCompanyMemberRole,
  respondAssessCandidateAssessment, respondAssessCompanyMembership, saveAssessCandidateAnswers,
  selectAssessCandidatePortfolio, selectAssessCandidatePortfolioEvidence, saveAssessCompanyDecision, submitAssessInterviewReview, submitAssessTechnicalReview,
  withdrawAssessCandidateAssessment, type AssessCaseReview,
} from "../../lib/api/assessCompanies";
import { useTranslation } from "react-i18next";

const panel = "assess-panel";
const field = "assess-field";
const primary = "assess-button assess-button--primary";
const secondary = "assess-button";
const statusLabel: Record<string, [string, string]> = {
  INVITED: ["Очікує відповіді", "Awaiting response"], ACCEPTED: ["Згоду надано", "Consent given"],
  PORTFOLIO_SELECTED: ["Версію обрано", "Version selected"], TASK_ASSIGNED: ["Технічне завдання", "Technical task"],
  TASK_SUBMITTED: ["Завдання подано", "Task submitted"], REVIEWED: ["Рецензію завершено", "Review complete"],
  DECLINED: ["Запрошення відхилено", "Invitation declined"], WITHDRAWN: ["Участь відкликано", "Participation withdrawn"],
  CLOSED: ["Закрито", "Closed"],
};
const emptyReview = (criterionCount = 3): AssessCaseReview => ({ scores: Array.from({ length: criterionCount }, () => null), comment: "", recommendation: null, allowPortfolioEvidence: false });

export const AssessWorkspacePage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [params, setParams] = useSearchParams();
  const [candidateQuery, setCandidateQuery] = React.useState({ page: 1, search: "", status: "" });
  const [dashboard, setDashboard] = React.useState<{ companies: Array<Record<string, any>>; pendingMemberships: Array<Record<string, any>>; candidateCases: Array<Record<string, any>> } | null>(null);
  const [company, setCompany] = React.useState<Record<string, any> | null>(null);
  const [caseView, setCaseView] = React.useState<Record<string, any> | null>(null);
  const [caseRole, setCaseRole] = React.useState<"OWNER" | "HR" | "ENGINEER" | null>(null);
  const [portfolioOptions, setPortfolioOptions] = React.useState<Array<Record<string, any>>>([]);
  const [portfolioWorkOptions, setPortfolioWorkOptions] = React.useState<Array<Record<string, any>>>([]);
  const [selectedVersion, setSelectedVersion] = React.useState("");
  const [selectedWorkId, setSelectedWorkId] = React.useState("");
  const [ndaTitle, setNdaTitle] = React.useState("");
  const [ndaRole, setNdaRole] = React.useState("");
  const [ndaSummary, setNdaSummary] = React.useState("");
  const [ndaTechnologies, setNdaTechnologies] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [answerSaveState, setAnswerSaveState] = React.useState<"saved" | "saving" | "error">("saved");
  const [hrReview, setHrReview] = React.useState<AssessCaseReview>(emptyReview);
  const [techReview, setTechReview] = React.useState<AssessCaseReview>(emptyReview);
  const [companyName, setCompanyName] = React.useState("");
  const [memberUsername, setMemberUsername] = React.useState("");
  const [memberRole, setMemberRole] = React.useState<"HR" | "ENGINEER">("HR");
  const [candidateUsername, setCandidateUsername] = React.useState("");
  const [candidateEmail, setCandidateEmail] = React.useState("");
  const [bulkCandidateRows, setBulkCandidateRows] = React.useState("");
  const [roleTitle, setRoleTitle] = React.useState("");
  const [roleProfile, setRoleProfile] = React.useState<AssessRoleProfileKey>("SOFTWARE_ENGINEERING");
  const [introduction, setIntroduction] = React.useState("");
  const [estimatedMinutes, setEstimatedMinutes] = React.useState(45);
  const [deadlineAt, setDeadlineAt] = React.useState("");
  const [aiPolicy, setAiPolicy] = React.useState<"ALLOWED" | "NOT_ALLOWED" | "DISCUSS">("DISCUSS");
  const [decisionOutcome, setDecisionOutcome] = React.useState<"ADVANCE" | "REJECT" | "HOLD">("HOLD");
  const [decisionRationale, setDecisionRationale] = React.useState("");
  const [releaseDecisionToCandidate, setReleaseDecisionToCandidate] = React.useState(false);
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
  const view = assessView(params.get("view"));
  const creating = params.get("new") === "company";
  const [dossierTab, setDossierTab] = React.useState("interview");
  const currentRoute = React.useRef({ companyId, assessmentId, candidateCaseId });
  currentRoute.current = { companyId, assessmentId, candidateCaseId };
  const companyListRequest = React.useRef(0);
  const companyForFilters = React.useRef(companyId);
  const candidateQueryRef = React.useRef(candidateQuery);
  candidateQueryRef.current = candidateQuery;
  const viewRef = React.useRef(view);
  viewRef.current = view;
  const savedAnswersSignature = React.useRef("");
  const answerSaveQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  const answerSaveTimer = React.useRef<number | null>(null);
  const answerDraftKey = (id: string) => `studycod:assess-answer-draft:${id}`;
  const requestKeys = React.useRef(new Map<string, { fingerprint: string; key: string }>());
  const stableRequestKey = (name: string, payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    const existing = requestKeys.current.get(name);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const key = crypto.randomUUID();
    requestKeys.current.set(name, { fingerprint, key });
    return key;
  };

  const onCandidateFilter = React.useCallback((search: string, status: string) => {
    setCandidateQuery(current => current.search === search && current.status === status && current.page === 1
      ? current : { page: 1, search, status });
  }, []);
  const onCandidatePage = React.useCallback((page: number) => {
    setCandidateQuery(current => current.page === page ? current : { ...current, page: Math.max(1, page) });
  }, []);

  const refreshDashboard = React.useCallback(async () => setDashboard(await getAssessCompanies()), []);
  const refreshCompany = React.useCallback(async (id: string, query = candidateQueryRef.current, technical = viewRef.current === "assessments") => {
    const request = ++companyListRequest.current;
    const data = await getAssessCompany(id, { ...query, technical });
    if (currentRoute.current.companyId === id && companyListRequest.current === request) setCompany(normalizeAssessCompany(data));
  }, []);
  const refreshCandidateCase = React.useCallback(async (id: string) => {
    const next = await getAssessCandidateAssessment(id);
    if (currentRoute.current.candidateCaseId !== id) return;
    setCaseView(next);
    const serverAnswers = Object.fromEntries((next.questions ?? []).map((question: any) => [question.id, (next.answers ?? []).find((answer: any) => answer.questionId === question.id)?.answer ?? ""])) as Record<string, string>;
    savedAnswersSignature.current = JSON.stringify(serverAnswers);
    let visibleAnswers = serverAnswers;
    if (!next.answersSubmittedAt) {
      try {
        const local = JSON.parse(localStorage.getItem(answerDraftKey(id)) ?? "null");
        if (local && typeof local === "object" && !Array.isArray(local) && Object.entries(local).every(([questionId, answer]) => (next.questions ?? []).some((question: any) => question.id === questionId) && typeof answer === "string")) {
          visibleAnswers = { ...serverAnswers, ...local };
        }
      } catch { /* optional local recovery */ }
    }
    setAnswers(visibleAnswers);
    setAnswerSaveState("saved");
    if (["ACCEPTED", "PORTFOLIO_SELECTED"].includes(next.status)) {
      const options = await getAssessCandidatePortfolioOptions(id);
      if (currentRoute.current.candidateCaseId === id) { setPortfolioOptions(options.versions); setPortfolioWorkOptions(options.works); }
    } else { setPortfolioOptions([]); setPortfolioWorkOptions([]); }
  }, []);
  const refreshCompanyCase = React.useCallback(async (cid: string, id: string) => {
    const result = await getAssessCompanyAssessment(cid, id);
    if (currentRoute.current.companyId !== cid || currentRoute.current.assessmentId !== id) return;
    setCaseRole(result.role); setCaseView(result.assessment);
    const ownHrReview = result.assessment.ownHrReview;
    const ownTechnicalReview = result.assessment.ownTechnicalReview;
    const criterionCount = Array.isArray(result.assessment.rubric) && result.assessment.rubric.length ? result.assessment.rubric.length : 3;
    const reviewForRubric = (review: any, includePortfolio = false): AssessCaseReview => ({
      scores: Array.from({ length: criterionCount }, (_, index) => review?.scores?.[index] ?? null),
      comment: review?.comment ?? "", recommendation: review?.recommendation ?? null,
      ...(includePortfolio ? { allowPortfolioEvidence: Boolean(review?.allowPortfolioEvidence) } : {}),
    });
    setHrReview(reviewForRubric(ownHrReview));
    setTechReview(reviewForRubric(ownTechnicalReview, true));
    const decision = result.assessment.finalDecision;
    setDecisionOutcome(["ADVANCE", "REJECT", "HOLD"].includes(decision?.outcome) ? decision.outcome : "HOLD");
    setDecisionRationale(decision?.rationale ?? "");
    setReleaseDecisionToCandidate(decision?.releaseToCandidate === true);
  }, []);

  React.useEffect(() => { void refreshDashboard().catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not load company workspace" : "Не вдалося завантажити простір компанії")))); }, [refreshDashboard, en]);
  React.useEffect(() => {
    if (!companyId) { companyForFilters.current = null; companyListRequest.current += 1; setCompany(null); return; }
    if (companyForFilters.current !== companyId) {
      companyForFilters.current = companyId;
      setCompany(null); setError("");
      setCandidateQuery({ page: 1, search: "", status: "" });
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshCompany(companyId, candidateQuery, view === "assessments").catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not open company" : "Не вдалося відкрити компанію"))));
    }, candidateQuery.search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [companyId, candidateQuery, view, refreshCompany, en]);
  React.useEffect(() => {
    if (!candidateCaseId) return;
    setCaseRole(null); setCaseView(null); setConsentChecked(false); setError("");
    void refreshCandidateCase(candidateCaseId).catch(err => setError(String(err?.response?.data?.message ?? (en ? "Could not open invitation" : "Не вдалося відкрити запрошення"))));
  }, [candidateCaseId, refreshCandidateCase, en]);
  React.useEffect(() => {
    if (!candidateCaseId || caseView?.id !== candidateCaseId || caseView.answersSubmittedAt || !["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED"].includes(caseView.status)) return;
    const signature = JSON.stringify(answers);
    if (signature === savedAnswersSignature.current) return;
    let active = true;
    const storedAnswers = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
    try { localStorage.setItem(answerDraftKey(candidateCaseId), JSON.stringify(answers)); } catch { /* optional local recovery */ }
    setAnswerSaveState("saving");
    if (answerSaveTimer.current !== null) window.clearTimeout(answerSaveTimer.current);
    answerSaveTimer.current = window.setTimeout(() => {
      answerSaveQueue.current = answerSaveQueue.current.catch(() => undefined).then(async () => {
        await saveAssessCandidateAnswers(candidateCaseId, storedAnswers);
        savedAnswersSignature.current = signature;
        try {
          if (localStorage.getItem(answerDraftKey(candidateCaseId)) === JSON.stringify(answers)) localStorage.removeItem(answerDraftKey(candidateCaseId));
        } catch { /* optional local recovery */ }
        if (active) setAnswerSaveState("saved");
      }).catch(() => {
        if (active) setAnswerSaveState("error");
      });
    }, 700);
    return () => {
      active = false;
      if (answerSaveTimer.current !== null) window.clearTimeout(answerSaveTimer.current);
    };
  }, [answers, candidateCaseId, caseView?.id, caseView?.status, caseView?.answersSubmittedAt]);
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
    const result = await createAssessCompany(companyName);
    setParams({ company: result.id, view: "interviews" }); setCompanyName("");
    await refreshDashboard();
  }, en ? "Company workspace created." : "Простір компанії створено.");

  const respondMembership = (id: string, decision: "ACCEPT" | "DECLINE") => run(() => respondAssessCompanyMembership(id, decision), en ? "Invitation updated." : "Запрошення оновлено.", refreshDashboard);

  const sendMemberInvite = () => companyId && run(async () => {
    await inviteAssessCompanyMember(companyId, memberUsername, memberRole);
    setMemberUsername(""); await refreshCompany(companyId); await refreshDashboard();
  }, en ? "Team invitation sent." : "Запрошення команді надіслано.");

  const changeMemberRole = (membershipId: string, nextRole: "HR" | "ENGINEER") => {
    if (!companyId) return;
    void run(() => updateAssessCompanyMemberRole(companyId, membershipId, nextRole), en ? "Team role updated." : "Роль учасника оновлено.", async () => {
      await refreshCompany(companyId); await refreshDashboard();
    });
  };
  const revokeMemberAccess = (membershipId: string, status: string) => {
    if (!companyId) return;
    void run(() => revokeAssessCompanyMember(companyId, membershipId), status === "PENDING"
      ? (en ? "Team invitation cancelled." : "Запрошення команді скасовано.")
      : (en ? "Team access revoked." : "Доступ учасника відкликано."), async () => {
      await refreshCompany(companyId); await refreshDashboard();
    });
  };

  const sendCandidateInvite = () => companyId && run(async () => {
    const request = {
      ...(candidateEmail.trim() ? { candidateEmail: candidateEmail.trim() } : { candidateUsername: candidateUsername.trim() }),
      roleTitle, roleProfile, introduction, estimatedMinutes, deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null, aiPolicy,
      questions: [{ id: "q1", text: questionOne }, { id: "q2", text: questionTwo }],
    };
    const key = stableRequestKey("candidateInvite", request);
    await inviteAssessCandidate(companyId, {
      ...request, idempotencyKey: key,
    });
    requestKeys.current.delete("candidateInvite");
    setCandidateUsername(""); setCandidateEmail(""); setRoleTitle(""); setRoleProfile("SOFTWARE_ENGINEERING"); setIntroduction(""); setEstimatedMinutes(45); setDeadlineAt(""); setAiPolicy("DISCUSS"); setQuestionOne(""); setQuestionTwo("");
    await refreshCompany(companyId); await refreshDashboard();
  }, en ? "Candidate invitation sent." : "Запрошення кандидату надіслано.");

  const useRoleCaseTemplate = () => {
    const template = assessRoleCaseTemplates[roleProfile];
    setIntroduction(en ? template.introductionEn : template.introductionUk);
    setQuestionOne(template[en ? "questionsEn" : "questionsUk"][0]);
    setQuestionTwo(template[en ? "questionsEn" : "questionsUk"][1]);
  };

  const sendBulkCandidateInvites = async () => {
    if (!companyId || busy) return;
    const rows = bulkCandidateRows.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^email(\s*[,;\t]|$)/i.test(line));
    if (!rows.length) { setError(en ? "Add one candidate email per line." : "Додай email кожного кандидата з нового рядка."); return; }
    if (rows.length > 50) { setError(en ? "Send at most 50 invitations at a time." : "За один раз можна надіслати не більше 50 запрошень."); return; }
    if (roleTitle.trim().length < 2 || introduction.trim().length < 10 || questionOne.trim().length < 3 || questionTwo.trim().length < 3) {
      setError(en ? "Complete the role, introduction, and both questions before sending." : "Перед відправленням заповни роль, опис і обидва запитання."); return;
    }
    const seen = new Set<string>();
    const rejected = new Map<string, { email: string; original: string; reason: string }>();
    const recipients = rows.map(line => {
      const [rawEmail, ...roleParts] = line.split(",");
      const email = rawEmail.trim().toLowerCase();
      return { email, role: roleParts.join(",").trim() || roleTitle.trim(), original: line };
    }).filter(recipient => {
      if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(recipient.email) || seen.has(recipient.email)) {
        rejected.set(`${recipient.email}:${recipient.original}`, { email: recipient.email || recipient.original, original: recipient.original, reason: seen.has(recipient.email) ? (en ? "duplicate email" : "дублікат email") : (en ? "invalid email" : "некоректний email") });
        return false;
      }
      seen.add(recipient.email); return true;
    });
    if (!recipients.length) {
      setBulkCandidateRows([...rejected.values()].map(item => item.original).join("\n"));
      setError(en ? "No valid, unique email addresses were found. Correct the rows and retry." : "Не знайдено унікальних коректних email-адрес. Виправ рядки й повтори."); return;
    }
    setBusy(true); setError(""); setNotice("");
    let sent = 0;
    const failed: Array<{ email: string; original: string; reason: string }> = [...rejected.values()];
    try {
      for (const recipient of recipients) {
        const request = {
          candidateEmail: recipient.email, roleTitle: recipient.role, roleProfile,
          introduction, estimatedMinutes, deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null, aiPolicy,
          questions: [{ id: "q1", text: questionOne }, { id: "q2", text: questionTwo }],
        };
        const keyName = `bulkCandidateInvite:${recipient.email}`;
        const idempotencyKey = stableRequestKey(keyName, request);
        try {
          await inviteAssessCandidate(companyId, { ...request, idempotencyKey });
          requestKeys.current.delete(keyName); sent += 1;
        } catch (failure: any) {
          failed.push({ email: recipient.email, original: recipient.original, reason: String(failure?.response?.data?.code ?? (en ? "send failed" : "помилка відправлення")) });
        }
      }
      setBulkCandidateRows(failed.map(item => item.original).join("\n"));
      await refreshCompany(companyId); await refreshDashboard();
      const detail = failed.slice(0, 5).map(item => `${item.email} (${item.reason})`).join(", ");
      report(en
        ? `${sent} invitation${sent === 1 ? "" : "s"} sent; ${failed.length} failed.${detail ? ` Retry: ${detail}${failed.length > 5 ? ", …" : ""}` : ""}`
        : `Надіслано запрошень: ${sent}; помилок: ${failed.length}.${detail ? ` Повтори: ${detail}${failed.length > 5 ? ", …" : ""}` : ""}`);
    } catch (failure: any) {
      fail(failure, en ? "Could not refresh the company workspace" : "Не вдалося оновити простір компанії");
    } finally { setBusy(false); }
  };

  const chooseCandidateVersion = () => {
    const item = portfolioOptions.find(version => version.versionId === selectedVersion);
    if (!item || !candidateCaseId) return;
    void run(() => selectAssessCandidatePortfolio(candidateCaseId, item.projectId, item.versionId), en ? "Project version shared with the company." : "Версію проєкту передано компанії.", () => refreshCandidateCase(candidateCaseId));
  };

  const chooseCandidateWork = () => {
    if (!selectedWorkId || !candidateCaseId) return;
    void run(() => selectAssessCandidatePortfolioEvidence(candidateCaseId, { type: "PORTFOLIO_WORK", workId: selectedWorkId }), en ? "Portfolio work shared with the company." : "Роботу портфоліо передано компанії.", () => refreshCandidateCase(candidateCaseId));
  };

  const submitNdaSummary = () => {
    if (!candidateCaseId) return;
    const technologies = ndaTechnologies.split(",").map(value => value.trim()).filter(Boolean);
    void run(() => selectAssessCandidatePortfolioEvidence(candidateCaseId, { type: "NDA_SUMMARY", title: ndaTitle, role: ndaRole, summary: ndaSummary, technologies }), en ? "NDA-safe work summary shared." : "Передано знеособлений опис роботи.", () => refreshCandidateCase(candidateCaseId));
  };

  const saveAnswers = () => {
    if (!candidateCaseId) return;
    const submittedAnswers = (caseView?.questions ?? []).map((question: any) => ({ questionId: question.id, answer: answers[question.id] ?? "" }));
    if (answerSaveTimer.current !== null) window.clearTimeout(answerSaveTimer.current);
    try { localStorage.setItem(answerDraftKey(candidateCaseId), JSON.stringify(answers)); } catch { /* optional local recovery */ }
    void run(async () => {
      answerSaveQueue.current = answerSaveQueue.current.catch(() => undefined).then(() => saveAssessCandidateAnswers(candidateCaseId, submittedAnswers, true));
      const result = await answerSaveQueue.current as { submittedAt?: string | null };
      savedAnswersSignature.current = JSON.stringify(answers);
      try { localStorage.removeItem(answerDraftKey(candidateCaseId)); } catch { /* optional local recovery */ }
      setCaseView(old => old ? { ...old, answersSubmittedAt: result.submittedAt ?? new Date().toISOString() } : old);
    }, en ? "Interview answers submitted." : "Відповіді подано.", () => refreshCandidateCase(candidateCaseId));
  };

  const withdraw = () => {
    if (!candidateCaseId) return;
    const confirmed = window.confirm(en
      ? "Withdraw from this process? The company will lose access to your shared answers and work, and your active assessment task will be cancelled."
      : "Відкликати участь у відборі? Компанія втратить доступ до переданих відповідей і роботи, а активне тестове завдання буде скасовано.");
    if (!confirmed) return;
    void run(async () => {
      await withdrawAssessCandidateAssessment(candidateCaseId); setCaseView(null); setParams({}); await refreshDashboard();
    }, en ? "Participation withdrawn." : "Участь відкликано.");
  };

  const submitInterviewReview = () => companyId && assessmentId && run(
    () => submitAssessInterviewReview(companyId, assessmentId, hrReview),
    en ? "HR review saved." : "Відгук HR збережено.", () => refreshCompanyCase(companyId, assessmentId),
  );
  const submitTechnicalReview = () => companyId && assessmentId && run(
    () => submitAssessTechnicalReview(companyId, assessmentId, techReview),
    en ? "Engineering review saved." : "Відгук інженера збережено.", () => refreshCompanyCase(companyId, assessmentId),
  );
  const saveFinalDecision = () => companyId && assessmentId && run(
    () => saveAssessCompanyDecision(companyId, assessmentId, { outcome: decisionOutcome, rationale: decisionRationale.trim(), releaseToCandidate: releaseDecisionToCandidate }),
    en ? "Hiring decision saved." : "Рішення щодо кандидата збережено.", () => refreshCompanyCase(companyId, assessmentId),
  );

  const assignTask = () => companyId && assessmentId && run(async () => {
    const request = {
      title: taskTitle, prompt: taskPrompt,
      tests: [
        { input: publicInput, output: publicOutput, group: "public-example", hidden: false },
        { input: hiddenInput, output: hiddenOutput, group: "requirement-change", hidden: true },
      ],
    };
    const idempotencyKey = stableRequestKey("technicalTask", request);
    await assignAssessTechnicalTask(companyId, assessmentId, {
      ...request, idempotencyKey,
    });
    requestKeys.current.delete("technicalTask");
    await refreshCompanyCase(companyId, assessmentId); await refreshCompany(companyId);
  }, en ? "Technical task assigned." : "Технічне завдання призначено.");

  const visitCandidateCase = (id: string) => { setCaseView(null); setParams({ case: id }); };
  const visitCompanyCase = (id: string) => { if (companyId) { setCaseView(null); setParams({ company: companyId, assessment: id }); } };
  const changeView = (next: AssessView) => { if (companyId) { setCaseView(null); setParams({ company: companyId, view: next }); } };
  const dossierTabs = [
    ...(["OWNER", "HR"].includes(caseRole ?? "") ? [["interview", en ? "Interview" : "Співбесіда"]] : []),
    ["portfolio", en ? "Portfolio evidence" : "Докази з портфоліо"],
    ...(["OWNER", "ENGINEER"].includes(caseRole ?? "") ? [["task", en ? "Requirement change" : "Зміна вимог"]] : []),
    ...(["OWNER", "ENGINEER"].includes(caseRole ?? "") ? [["changes", en ? "Compare changes" : "Порівняти зміни"]] : []),
    ["feedback", en ? "Feedback" : "Відгуки"],
  ];
  const scoreLabels: string[] = caseView?.rubric?.map((criterion: any) => en ? criterion.labelEn : criterion.labelUk) ?? (en ? ["Understanding requirements", "Reasoning and design", "Code quality and tests"] : ["Розуміння вимог", "Обґрунтування рішення", "Якість коду й перевірок"]);
  const reviewForm = (value: AssessCaseReview, setValue: React.Dispatch<React.SetStateAction<AssessCaseReview>>, label: string, submit: () => void, canSubmit: boolean, showPortfolioPermission = false) => <section className={panel}>
    <h3 className="font-bold">{label}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{scoreLabels.map((item, index) => <label key={caseView?.rubric?.[index]?.id ?? item} className="text-xs font-semibold">{item}<select value={value.scores[index] ?? ""} onChange={event => setValue(old => ({ ...old, scores: old.scores.map((score, current) => current === index ? (event.target.value === "" ? null : Number(event.target.value)) : score) }))} className={field}><option value="">{en ? "Not assessed" : "Не оцінювалося"}</option>{[0, 1, 2, 3].map(score => <option value={score} key={score}>{score} / 3</option>)}</select></label>)}</div>
    <p className="mt-2 text-xs leading-5 text-text-muted">{en ? "0 = no evidence · 1 = limited evidence · 2 = meets expectations · 3 = strong evidence. Leave blank when not assessed." : "0 = немає доказів · 1 = обмежені докази · 2 = відповідає очікуванням · 3 = сильні докази. Не заповнюй критерій, якщо його не оцінювали."}</p>
    <label className="mt-3 block text-sm font-semibold">{en ? "Feedback" : "Коментар"}<textarea rows={3} maxLength={6000} value={value.comment} onChange={event => setValue(old => ({ ...old, comment: event.target.value }))} className={field} /></label>
    <label className="mt-3 block text-sm font-semibold">{en ? "Recommendation" : "Рекомендація"}<select value={value.recommendation ?? ""} onChange={event => setValue(old => ({ ...old, recommendation: (event.target.value || null) as AssessCaseReview["recommendation"] }))} className={field}><option value="">{en ? "Choose a recommendation" : "Обери рекомендацію"}</option><option value="READY_TO_CONTINUE">{en ? "Ready to continue" : "Можна продовжувати"}</option><option value="NEEDS_WORK">{en ? "Needs more work" : "Варто доопрацювати"}</option></select></label>
    {showPortfolioPermission && <label className="mt-3 flex items-start gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" className="mt-1 accent-primary" checked={Boolean(value.allowPortfolioEvidence)} onChange={event => setValue(old => ({ ...old, allowPortfolioEvidence: event.target.checked }))}/><span>{en ? "Allow the candidate to include a code-free summary of this reviewed Judge result in their public Portfolio." : "Дозволити кандидату додати до публічного Portfolio короткий опис перевіреного Judge результату без коду."}</span></label>}
    <button type="button" disabled={busy || !canSubmit || !value.recommendation || value.comment.trim().length < 12} onClick={submit} className={`${primary} mt-4`}><ClipboardCheck className="h-4 w-4" />{en ? "Save review" : "Зберегти відгук"}</button>
    <p className="mt-2 text-xs leading-5 text-text-muted">{en ? "This is structured feedback for learning and discussion, not an automated hiring score." : "Це структурований відгук для навчання й обговорення, а не автоматична оцінка кандидата для найму."}</p>
  </section>;

  const companyForm = <form onSubmit={event => { event.preventDefault(); void createCompany(); }}><label className="assess-form-label">{en ? "Company name" : "Назва компанії"}<input value={companyName} onChange={event => setCompanyName(event.target.value)} required minLength={2} maxLength={160} autoComplete="organization" placeholder={en ? "Your company" : "Твоя компанія"} className={field}/></label><button disabled={busy || companyName.trim().length < 2} className={`${primary} mt-4 w-full`} type="submit"><Plus size={16}/>{en ? "Create workspace" : "Створити робочий простір"}</button><p className="assess-form-hint">{en ? "You will be the owner. Team members join by invitation." : "Ти станеш власником. Учасники команди приєднаються за запрошеннями."}</p></form>;
  const memberForm = <form onSubmit={event => { event.preventDefault(); void sendMemberInvite(); }} className="assess-form-grid"><label className="assess-form-label">{en ? "Registered username" : "Username зареєстрованого користувача"}<input value={memberUsername} onChange={event => setMemberUsername(event.target.value)} required maxLength={80} className={field}/></label><label className="assess-form-label">{en ? "Responsibility" : "Відповідальність"}<select value={memberRole} onChange={event => setMemberRole(event.target.value as "HR" | "ENGINEER")} className={field}><option value="HR">{en ? "HR · invitations and interviews" : "HR · запрошення та співбесіди"}</option><option value="ENGINEER">{en ? "Engineer · tasks and code review" : "Інженер · задачі та розгляд коду"}</option></select></label><div className="assess-form-full"><button type="submit" disabled={busy || !memberUsername.trim()} className={primary}><UserRoundPlus size={16}/>{en ? "Send team invitation" : "Надіслати запрошення в команду"}</button></div></form>;
  const candidateForm = <form onSubmit={event => { event.preventDefault(); void sendCandidateInvite(); }} className="assess-form-grid">
    <label className="assess-form-label">{en ? "Candidate email" : "Email кандидата"}<input type="email" autoComplete="email" value={candidateEmail} onChange={event => setCandidateEmail(event.target.value)} maxLength={320} placeholder="name@company.com" className={field}/></label>
    <label className="assess-form-label">{en ? "Existing StudyCod username" : "Username наявного акаунта StudyCod"}<input value={candidateUsername} onChange={event => setCandidateUsername(event.target.value)} maxLength={80} className={field}/></label>
    <p className="assess-form-full assess-form-hint">{en ? "Enter an email for a new or existing candidate, or use an existing username." : "Вкажи email нового чи наявного кандидата або username наявного акаунта."}</p>
    <label className="assess-form-label">{en ? "Role" : "Роль"}<input value={roleTitle} onChange={event => setRoleTitle(event.target.value)} required minLength={2} maxLength={160} placeholder={en ? "Python developer" : "Python-розробник"} className={field}/></label>
    <label className="assess-form-label">{en ? "Role profile and review rubric" : "Профіль ролі та критерії оцінювання"}<select value={roleProfile} onChange={event => setRoleProfile(event.target.value as AssessRoleProfileKey)} className={field}>{assessRoleProfiles.map(profile => <option key={profile.key} value={profile.key}>{en ? profile.en : profile.uk}</option>)}</select></label>
    <label className="assess-form-label">{en ? "Estimated time, minutes" : "Орієнтовний час, хвилин"}<input type="number" min={5} max={360} step={5} value={estimatedMinutes} onChange={event => setEstimatedMinutes(Number(event.target.value))} required className={field}/></label>
    <label className="assess-form-label">{en ? "Deadline (optional)" : "Дедлайн (необов’язково)"}<input type="datetime-local" value={deadlineAt} onChange={event => setDeadlineAt(event.target.value)} className={field}/></label>
    <label className="assess-form-label">{en ? "AI and external tools" : "ШІ та зовнішні інструменти"}<select value={aiPolicy} onChange={event => setAiPolicy(event.target.value as typeof aiPolicy)} className={field}><option value="DISCUSS">{en ? "Allowed with disclosure" : "Дозволені з поясненням"}</option><option value="ALLOWED">{en ? "Allowed, disclose generated work" : "Дозволені, позначити згенероване"}</option><option value="NOT_ALLOWED">{en ? "Not allowed" : "Не дозволені"}</option></select></label>
    <label className="assess-form-label assess-form-full">{en ? "What should the candidate expect?" : "Що очікує на кандидата?"}<textarea rows={3} value={introduction} onChange={event => setIntroduction(event.target.value)} required minLength={10} maxLength={4000} placeholder={en ? "Describe the role, format and technical work." : "Опиши роль, формат і технічну роботу."} className={field}/></label>
    <label className="assess-form-label">{en ? "Interview question 1" : "Запитання співбесіди 1"}<textarea rows={3} value={questionOne} onChange={event => setQuestionOne(event.target.value)} required minLength={3} maxLength={500} className={field}/></label>
    <label className="assess-form-label">{en ? "Interview question 2" : "Запитання співбесіди 2"}<textarea rows={3} value={questionTwo} onChange={event => setQuestionTwo(event.target.value)} required minLength={3} maxLength={500} className={field}/></label>
    <div className="assess-form-full"><button type="button" className="assess-text-button" onClick={useRoleCaseTemplate}>{en ? "Load a practical case for this role" : "Завантажити практичний кейс для цієї ролі"}</button><p className="assess-form-hint">{en ? "The candidate can complete this written case without a StudyCod project. Answers are reviewed by a person, not auto-scored." : "Кандидат може виконати цей письмовий кейс без проєкту StudyCod. Відповіді розглядає людина; автоматичного балу немає."}</p></div>
    <div className="assess-form-full rounded-xl border border-border bg-bg-base p-4"><label className="block text-sm font-semibold">{en ? "Bulk invite by email" : "Масові запрошення за email"}<textarea rows={4} maxLength={20000} value={bulkCandidateRows} onChange={event => setBulkCandidateRows(event.target.value)} placeholder={en ? "candidate@example.com\nname@example.com, Senior QA Engineer" : "candidate@example.com\nname@example.com, Senior QA Engineer"} className={field}/></label><p className="mt-1 text-xs leading-5 text-text-muted">{en ? "One email per line; optionally add a role title after a comma. Uses the role profile, questions, deadline, and tool policy above. Up to 50 candidates per batch." : "Один email у рядку; після коми можна вказати назву ролі. Для всіх застосуються профіль, запитання, дедлайн і правила вище. До 50 кандидатів за раз."}</p><button type="button" disabled={busy || !bulkCandidateRows.trim()} onClick={() => void sendBulkCandidateInvites()} className={`${secondary} mt-3`}><UserRoundPlus size={16}/>{en ? "Send bulk invitations" : "Надіслати запрошення списку"}</button></div>
    <div className="assess-form-full"><button type="submit" disabled={busy || (Boolean(candidateEmail.trim()) === Boolean(candidateUsername.trim())) || roleTitle.trim().length < 2 || introduction.trim().length < 10 || questionOne.trim().length < 3 || questionTwo.trim().length < 3 || estimatedMinutes < 5 || estimatedMinutes > 360} className={primary}><UserRoundPlus size={16}/>{en ? "Send candidate invitation" : "Надіслати запрошення кандидату"}</button><p className="assess-form-hint">{en ? "The invitation includes the time estimate, deadline and tool policy. The candidate decides whether to participate and what work to share." : "Запрошення міститиме орієнтовний час, дедлайн і правила щодо інструментів. Кандидат сам вирішує, чи брати участь і чим ділитися."}</p></div>
  </form>;
  const context = <><div className="assess-context"><span className="assess-context__avatar">{company?.name?.slice(0, 1).toUpperCase() ?? "T"}</span><div><label htmlFor="assess-workspace-picker">{candidateCaseId ? (en ? "Candidate workspace" : "Простір кандидата") : (en ? "Company workspace" : "Робочий простір компанії")}</label><select id="assess-workspace-picker" value={creating ? "__new" : companyId ?? ""} onChange={event => { setCaseView(null); const value = event.target.value; setParams(value === "__new" ? { new: "company" } : value ? { company: value, view: "interviews" } : {}); }}><option value="">{en ? "My workspaces" : "Мої робочі простори"}</option>{dashboard?.companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ {en ? "Create a company" : "Створити компанію"}</option></select></div></div><span className="assess-context-note"><Code2 size={15}/>{en ? "Interviews & development" : "Співбесіди й розвиток"}</span></>;
  const navigation = <nav className="assess-nav" aria-label={en ? "StudyCod Assess workspace" : "Розділи StudyCod Assess"}>{companyId ? (["interviews", "candidates", "kits", "team"] as AssessView[]).map(tab => <button key={tab} type="button" aria-current={(assessmentId || view === "assessments" || view === "overview" ? tab === "candidates" : view === tab) ? "page" : undefined} onClick={() => changeView(tab)}>{({ interviews: en ? "Interviews" : "Співбесіди", kits: en ? "Kits & tests" : "Комплекти й тести", overview: en ? "Overview" : "Огляд", candidates: en ? "Candidates" : "Кандидати", assessments: en ? "Technical assessments" : "Технічні оцінювання", integrations: en ? "Integrations" : "Інтеграції", team: en ? "Team" : "Команда" })[tab]}{tab === "candidates" && !!company?.assessments?.length && <span className="assess-nav__count">{company.assessments.length}</span>}</button>) : <><button type="button" aria-current={!candidateCaseId && params.get("view") !== "invitations" ? "page" : undefined} onClick={() => { setCaseView(null); setParams({}); }}>{en ? "Workspaces" : "Робочі простори"}</button><button type="button" aria-current={candidateCaseId || params.get("view") === "invitations" ? "page" : undefined} onClick={() => { setCaseView(null); setParams({ view: "invitations" }); }}>{en ? "My invitations" : "Мої запрошення"}{!!dashboard?.candidateCases.length && <span className="assess-nav__count">{dashboard.candidateCases.length}</span>}</button></>}</nav>;

  return <AssessWorkspaceShell context={context} navigation={navigation}><main id="main-content" className="assess-main">
    {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-5 rounded-lg border p-3 text-sm ${error ? "border-accent-warn/40 bg-accent-warn/5" : "border-primary/30 bg-primary/5"}`}>{error || notice}</div>}
    {(candidateCaseId || assessmentId) && !caseView && !error && <div className="assess-loading" role="status"><span className="assess-skeleton assess-skeleton--title"/><span className="assess-skeleton assess-skeleton--row"/><span className="assess-skeleton assess-skeleton--row"/><span className="sr-only">{en ? "Loading dossier" : "Завантажується досьє"}</span></div>}
    {candidateCaseId && caseView && !caseRole ? <section className="space-y-4">
      <button type="button" onClick={() => { setParams({ view: "invitations" }); setCaseView(null); }} className="assess-text-button"><ArrowLeft size={15}/>{en ? "My invitations" : "Мої запрошення"}</button>
      <AssessJourney assessment={caseView} en={en}/>
      <article className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary-soft">{caseView.companyName}</p><h2 className="mt-1 text-2xl font-bold">{caseView.roleTitle}</h2></div><span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold">{statusLabel[caseView.status]?.[en ? 1 : 0] ?? caseView.status}</span></div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.introduction}</p>
        {caseView.finalDecision && <article className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="font-bold">{en ? "Decision from the hiring team" : "Рішення команди найму"}</h3><p className="mt-1 text-sm font-semibold">{caseView.finalDecision.outcome === "ADVANCE" ? (en ? "Advance to next step" : "Запрошення на наступний етап") : caseView.finalDecision.outcome === "HOLD" ? (en ? "On hold" : "Рішення відкладено") : caseView.finalDecision.outcome === "REJECT" ? (en ? "The process will not continue" : "Відбір не продовжиться") : (en ? "Decision recorded" : "Рішення зафіксовано")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.finalDecision.rationale}</p></article>}
        {caseView.rubric?.length > 0 && <section className="mt-4 rounded-xl bg-bg-base p-4"><h3 className="text-sm font-bold">{en ? "How your evidence is reviewed" : "За якими критеріями розглянуть твої матеріали"}</h3><ul className="mt-2 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">{caseView.rubric.map((criterion: any) => <li key={criterion.id}>{en ? criterion.labelEn : criterion.labelUk}</li>)}</ul><p className="mt-2 text-xs text-text-muted">{en ? "Reviewers use these criteria as a discussion aid. They do not produce an automated hiring score." : "Рецензенти використовують ці критерії для обговорення. Вони не формують автоматичний бал для найму."}</p></section>}
        {caseView.status === "INVITED" && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consentChecked} onChange={event => setConsentChecked(event.target.checked)} className="mt-1" /><span>{en ? "I agree to share my answers and the specific project evidence I choose (a project version, Portfolio work, or an NDA-safe summary) with this company for this assessment. I can withdraw later." : "Я погоджуюся передати цій компанії відповіді та конкретний обраний доказ роботи (версію проєкту, роботу з Portfolio або знеособлений опис). Згоду можна відкликати."}</span></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!consentChecked || busy} onClick={() => void run(() => respondAssessCandidateAssessment(caseView.id, "ACCEPT"), en ? "Consent saved." : "Згоду збережено.", () => refreshCandidateCase(caseView.id))} className={primary}><Check className="h-4 w-4" />{en ? "Agree and continue" : "Погодитися й продовжити"}</button><button type="button" disabled={busy} onClick={() => void run(() => respondAssessCandidateAssessment(caseView.id, "DECLINE"), en ? "Invitation declined." : "Запрошення відхилено.", refreshDashboard)} className={secondary}>{en ? "Decline" : "Відхилити"}</button></div></div>}
        {["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].includes(caseView.status) && <>
          <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Interview questions" : "Запитання співбесіди"}</h3><div className="mt-3 space-y-3">{(caseView.questions ?? []).map((question: any, index: number) => <label key={question.id} className="block text-sm font-semibold">{index + 1}. {question.text}<textarea rows={3} maxLength={6000} readOnly={Boolean(caseView.answersSubmittedAt)} value={answers[question.id] ?? ""} onChange={event => setAnswers(old => ({ ...old, [question.id]: event.target.value }))} className={field} /></label>)}</div><p className="mt-2 text-xs text-text-muted" role="status" aria-live="polite">{caseView.answersSubmittedAt ? (en ? "Answers submitted" : "Відповіді подано") : answerSaveState === "saving" ? (en ? "Saving your draft…" : "Зберігаємо чернетку…") : answerSaveState === "error" ? (en ? "Draft is stored on this device. Submit to retry saving it." : "Чернетку збережено на цьому пристрої. Натисни «Подати», щоб повторити збереження.") : (en ? "Draft saved" : "Чернетку збережено")}</p><button type="button" disabled={busy || Boolean(caseView.answersSubmittedAt)} onClick={saveAnswers} className={`${primary} mt-3`}>{caseView.answersSubmittedAt ? (en ? "Answers submitted" : "Відповіді подано") : (en ? "Submit answers" : "Подати відповіді")}</button>{caseView.answersSubmittedAt && <p className="mt-2 text-xs text-text-muted">{en ? "Your answers are frozen for review." : "Відповіді зафіксовано для рецензування."}</p>}</section>
          {caseView.status === "ACCEPTED" && <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Choose project evidence" : "Обери проєкт як доказ роботи"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "The company receives only this frozen version. Changes made for a technical task are kept in a separate copy." : "Компанія отримає лише цю зафіксовану версію. Зміни для технічного завдання будуть окремою копією."}</p><select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)} className={field}><option value="">{en ? "Select a saved version" : "Вибери збережену версію"}</option>{portfolioOptions.map(item => <option key={item.versionId} value={item.versionId}>{item.family} · {item.runtime} · {item.stage} #{item.sequence}</option>)}</select><button type="button" disabled={busy || !selectedVersion} onClick={chooseCandidateVersion} className={`${primary} mt-3`}>{en ? "Share this version" : "Передати цю версію"}</button>{portfolioOptions.length === 0 && <p className="mt-2 text-xs text-text-muted">{en ? "No supported frozen project versions are available yet. Build one in Projects first." : "Поки немає доступних зафіксованих версій. Спочатку створи її в розділі «Проєкти»."}</p>}</section>}
          <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Share Portfolio work" : "Передати роботу з Portfolio"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "Choose one work item you own. The company receives a frozen summary of only this item." : "Обери одну власну роботу. Компанія отримає зафіксований опис лише цього матеріалу."}</p>{portfolioWorkOptions.length ? <><select aria-label={en ? "Portfolio work" : "Робота з Portfolio"} value={selectedWorkId} onChange={event => setSelectedWorkId(event.target.value)} className={field}><option value="">{en ? "Select a work item" : "Обери роботу"}</option>{portfolioWorkOptions.map(item => <option key={item.id} value={item.id}>{item.title}{item.role ? ` · ${item.role}` : ""}</option>)}</select>{portfolioWorkOptions.find(item => item.id === selectedWorkId) && <div className="mt-2 rounded-xl bg-bg-base p-3 text-sm text-text-secondary">{portfolioWorkOptions.find(item => item.id === selectedWorkId)?.problem && <p>{portfolioWorkOptions.find(item => item.id === selectedWorkId)?.problem}</p>}{portfolioWorkOptions.find(item => item.id === selectedWorkId)?.solution && <p className="mt-2">{portfolioWorkOptions.find(item => item.id === selectedWorkId)?.solution}</p>}</div>}<button type="button" disabled={busy || !selectedWorkId} onClick={chooseCandidateWork} className={`${primary} mt-3`}>{en ? "Share this work" : "Передати цю роботу"}</button></> : <p className="mt-2 text-xs text-text-muted">{en ? "Add a work item to your Portfolio first, or share an NDA-safe summary below." : "Спочатку додай роботу до Portfolio або передай знеособлений опис нижче."}</p>}</section>
          <section className="mt-5 border-t border-border pt-4"><h3 className="font-bold">{en ? "Share NDA-safe experience" : "Передати опис без конфіденційних даних"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "Describe your contribution without client names, secrets, personal data, or proprietary code." : "Опиши свій внесок без назв клієнтів, секретів, персональних даних і закритого коду."}</p><label className="mt-3 block text-sm font-semibold">{en ? "Work title" : "Назва роботи"}<input maxLength={160} value={ndaTitle} onChange={event => setNdaTitle(event.target.value)} className={field}/></label><label className="mt-3 block text-sm font-semibold">{en ? "Your role" : "Твоя роль"}<input maxLength={120} value={ndaRole} onChange={event => setNdaRole(event.target.value)} className={field}/></label><label className="mt-3 block text-sm font-semibold">{en ? "Summary of your contribution" : "Коротко про свій внесок"}<textarea rows={4} maxLength={4000} value={ndaSummary} onChange={event => setNdaSummary(event.target.value)} className={field}/></label><label className="mt-3 block text-sm font-semibold">{en ? "Technologies (comma-separated)" : "Технології через кому"}<input maxLength={500} value={ndaTechnologies} onChange={event => setNdaTechnologies(event.target.value)} className={field}/></label><button type="button" disabled={busy || !ndaTitle.trim() || !ndaRole.trim() || !ndaSummary.trim()} onClick={submitNdaSummary} className={`${primary} mt-3`}>{en ? "Share NDA-safe summary" : "Передати знеособлений опис"}</button></section>

          {caseView.status === "PORTFOLIO_SELECTED" && <p className="mt-4 rounded-xl bg-bg-base p-3 text-sm text-text-secondary">{caseView.portfolioEvidence ? (en ? "Your selected Portfolio evidence is shared. The company can follow up with a live conversation." : "Обраний доказ з Portfolio передано. Компанія може продовжити оцінювання живою розмовою.") : (en ? "Your selected project version is shared. The engineering team may now add a short task." : "Обрану версію проєкту передано. Технічна команда може призначити коротке завдання.")}</p>}
          {caseView.status === "TASK_ASSIGNED" && caseView.task && <section className="mt-5 border-t border-border pt-4"><h3 className="text-lg font-bold">{caseView.task.card?.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.task.card?.prompt}</p><div className="mt-3 rounded-xl bg-bg-base p-3 text-sm text-text-secondary">{en ? "Built-in AI is disabled. Documentation is allowed. The platform cannot verify whether outside help was used." : "Вбудований AI вимкнений. Документацією користуватися можна. Платформа не може підтвердити відсутність зовнішньої допомоги."}</div><button type="button" onClick={() => window.location.assign(`/portfolio/projects?project=${encodeURIComponent(caseView.projectId)}`)} className={`${primary} mt-4`}><Code2 className="h-4 w-4" />{en ? "Open task workspace" : "Відкрити робоче місце задачі"}</button><p className="mt-2 text-xs text-text-muted">{en ? "The task uses the shared Judge queue; closing this page will not cancel an accepted check." : "Задача використовує спільну чергу Judge; закриття сторінки не скасує прийняту перевірку."}</p></section>}
          {(caseView.hrReviews?.length || caseView.technicalReviews?.length) ? <div className="mt-4 space-y-2">{[...(caseView.hrReviews ?? []).map((review: any) => ({ ...review, reviewType: en ? "HR feedback" : "Відгук HR" })), ...(caseView.technicalReviews ?? []).map((review: any) => ({ ...review, reviewType: en ? "Engineering feedback" : "Відгук інженера" }))].map((review: any, index: number) => <div key={`${review.reviewType}-${review.reviewerUsername ?? index}-${review.submittedAt ?? index}`} className="rounded-xl bg-bg-base p-3 text-sm"><strong>{review.reviewType}{review.reviewerUsername ? ` · ${review.reviewerUsername}` : ""}</strong><p className="mt-1 text-text-secondary">{review.comment}</p>{Array.isArray(review.scores) && <ul className="mt-2 grid gap-1 text-xs text-text-muted sm:grid-cols-2">{review.scores.map((score: number | null, scoreIndex: number) => <li key={caseView.rubric?.[scoreIndex]?.id ?? scoreIndex}>{caseView.rubric?.[scoreIndex] ? (en ? caseView.rubric[scoreIndex].labelEn : caseView.rubric[scoreIndex].labelUk) : (en ? `Criterion ${scoreIndex + 1}` : `Критерій ${scoreIndex + 1}`)} · {score === null ? (en ? "Not assessed" : "Не оцінювалося") : `${score} / 3`}</li>)}</ul>}</div>)}</div> : caseView.status === "TASK_SUBMITTED" && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{en ? "Your submission is with the engineering reviewer." : "Твою роботу передано інженерному рецензенту."}</div>}
        </>}
        {caseView.status !== "WITHDRAWN" && caseView.status !== "DECLINED" && <button type="button" disabled={busy} onClick={withdraw} className="mt-6 text-xs font-semibold text-text-muted underline">{en ? "Withdraw consent and participation" : "Відкликати згоду та участь"}</button>}
      </article>
    </section> : null}

    {assessmentId && companyId && caseView && caseRole ? <section className="space-y-4">
      <button type="button" onClick={() => { setParams({ company: companyId, view: "candidates" }); setCaseView(null); }} className="assess-text-button"><ArrowLeft size={15}/>{en ? "All candidates" : "Усі кандидати"}</button>
      <header><span className="assess-eyebrow">{en ? "Candidate dossier" : "Досьє кандидата"}</span><div className="assess-dossier-heading"><span className="assess-person__initial">{String(caseView.candidateUsername ?? "?").slice(0, 1).toUpperCase()}</span><div><h1>{caseView.candidateUsername}</h1><p>{caseView.roleTitle}</p></div><span className="assess-status ml-auto" data-status={caseView.status}>{statusLabel[caseView.status]?.[en ? 1 : 0] ?? caseView.status}</span></div><AssessJourney assessment={caseView} en={en}/>{!["DECLINED", "WITHDRAWN", "CLOSED"].includes(caseView.status) && <button type="button" className="assess-button mt-4" onClick={() => setParams({ company: companyId!, view: "interviews", scheduleFor: assessmentId! })}>{en ? "Schedule interview with this candidate" : "Запланувати співбесіду з цим кандидатом"}</button>}</header>
      {caseView.status !== "WITHDRAWN" && <nav className="assess-dossier-tabs" aria-label={en ? "Candidate evidence" : "Матеріали кандидата"}>{dossierTabs.map(([tab, label]) => <button key={tab} type="button" aria-pressed={dossierTab === tab} onClick={() => setDossierTab(tab)}>{label}</button>)}</nav>}
      {dossierTab === "portfolio" && !caseView.portfolio && !caseView.portfolioEvidence && caseView.status !== "WITHDRAWN" && <div className="assess-panel assess-empty"><h3>{en ? "The candidate has not shared a version yet" : "Кандидат ще не передав версію"}</h3><p>{en ? "Project code becomes available when the candidate selects a saved version after giving consent." : "Код проєкту стане доступним, коли кандидат надасть згоду й обере збережену версію."}</p></div>}
      {dossierTab === "task" && !caseView.task && caseView.status !== "PORTFOLIO_SELECTED" && caseView.status !== "WITHDRAWN" && <div className="assess-panel assess-empty"><Code2 size={25}/><h3>{en ? "A project version comes first" : "Спочатку потрібна версія проєкту"}</h3><p>{en ? "The engineer prepares a requirement change on the specific version selected by the candidate." : "Інженер підготує зміну вимог до конкретної версії, яку вибере кандидат."}</p></div>}
      {dossierTab === "feedback" && caseRole === "ENGINEER" && !["PASSED", "FAILED"].includes(caseView.task?.status) && caseView.status !== "WITHDRAWN" && <div className="assess-panel assess-empty"><ClipboardCheck size={25}/><h3>{en ? "Review follows the submission" : "Відгук після подання роботи"}</h3><p>{en ? "The candidate will explicitly submit a frozen working copy and its checks. You can then review the code and reasoning together." : "Кандидат явно подасть зафіксовану робочу копію з перевіркою. Після цього ти зможеш розглянути код і пояснення разом."}</p></div>}
      {dossierTab === "interview" && (caseRole === "OWNER" || caseRole === "HR") && caseView.status !== "WITHDRAWN" && <article className={panel}><h3 className="font-bold">{en ? "Candidate interview answers" : "Відповіді кандидата"}</h3><p className="mt-1 text-xs text-text-muted">{caseView.answersSubmittedAt ? (en ? "Submitted for review" : "Подано на рецензування") : (en ? "Draft in progress" : "Чернетка відповіді")}</p>{(caseView.questions ?? []).map((question: any) => <div key={question.id} className="mt-3 rounded-xl bg-bg-base p-3"><p className="text-xs font-bold text-text-muted">{question.text}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{(caseView.answers ?? []).find((answer: any) => answer.questionId === question.id)?.answer || (en ? "No answer yet" : "Відповіді ще немає")}</p></div>)}</article>}
      {dossierTab === "portfolio" && caseView.portfolio && caseView.status !== "WITHDRAWN" && <article className={panel}><h3 className="font-bold">{en ? "Candidate's frozen portfolio version" : "Зафіксована версія портфоліо кандидата"}</h3><p className="mt-1 text-sm text-text-secondary">{caseView.portfolio.family} · {caseView.portfolio.runtime} · {caseView.portfolio.stage} #{caseView.portfolio.sequence}</p><AssessEvidenceFiles files={caseView.portfolio.files ?? []} /></article>}
      {dossierTab === "portfolio" && caseView.portfolioEvidence && caseView.status !== "WITHDRAWN" && <article className={panel}><h3 className="font-bold">{caseView.portfolioEvidence.type === "NDA_SUMMARY" ? (en ? "NDA-safe work summary" : "Знеособлений опис роботи") : (en ? "Candidate's selected Portfolio work" : "Обрана кандидатом робота з Portfolio")}</h3><p className="mt-1 text-sm font-semibold">{caseView.portfolioEvidence.title}{caseView.portfolioEvidence.role ? ` · ${caseView.portfolioEvidence.role}` : ""}</p>{caseView.portfolioEvidence.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.portfolioEvidence.summary}</p>}{caseView.portfolioEvidence.problem && <div className="mt-3"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{en ? "Problem" : "Проблема"}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.portfolioEvidence.problem}</p></div>}{caseView.portfolioEvidence.solution && <div className="mt-3"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{en ? "Contribution / solution" : "Внесок / рішення"}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.portfolioEvidence.solution}</p></div>}{Array.isArray(caseView.portfolioEvidence.technologies) && caseView.portfolioEvidence.technologies.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{caseView.portfolioEvidence.technologies.map((technology: string) => <span key={technology} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary">{technology}</span>)}</div>}{caseView.portfolioEvidence.repositoryUrl && <a href={caseView.portfolioEvidence.repositoryUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-xl border border-border px-3 py-2 text-xs font-semibold">{en ? "Open repository" : "Відкрити репозиторій"}</a>}{caseView.portfolioEvidence.demoUrl && <a href={caseView.portfolioEvidence.demoUrl} target="_blank" rel="noopener noreferrer" className="ml-2 mt-3 inline-flex rounded-xl border border-border px-3 py-2 text-xs font-semibold">{en ? "Open demo" : "Відкрити демо"}</a>}</article>}
      {dossierTab === "task" && caseView.portfolioEvidence && !caseView.task && caseView.status === "PORTFOLIO_SELECTED" && (caseRole === "OWNER" || caseRole === "ENGINEER") && <div className="assess-panel assess-empty"><Code2 size={25}/><h3>{en ? "Discuss the selected work live" : "Обговори цю роботу наживо"}</h3><p>{en ? "This item has no shared code workspace. Use a structured live interview to explore the candidate's decisions, constraints, and contribution." : "Для цього матеріалу немає спільного середовища коду. Проведи структуровану живу розмову про рішення кандидата, обмеження та його внесок."}</p><button type="button" className={primary} onClick={() => setParams({ company: companyId!, view: "interviews", scheduleFor: assessmentId! })}>{en ? "Schedule live interview" : "Запланувати живу співбесіду"}</button></div>}
      {dossierTab === "task" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.status === "PORTFOLIO_SELECTED" && !caseView.portfolioEvidence && <article className={panel}><h3 className="font-bold">{en ? "Assign a short engineering task" : "Призначити коротке технічне завдання"}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "The candidate starts from a copy of the selected version. Include a public example and a hidden regression check." : "Кандидат почне з копії обраної версії. Додай публічний приклад і приховану регресійну перевірку."}</p><label className="mt-3 block text-sm font-semibold">{en ? "Task title" : "Назва задачі"}<input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} className={field} /></label><label className="mt-3 block text-sm font-semibold">{en ? "Requirement" : "Умова"}<textarea rows={4} value={taskPrompt} onChange={event => setTaskPrompt(event.target.value)} className={field} /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><strong className="text-sm">{en ? "Public example" : "Публічний приклад"}</strong><textarea aria-label="Public input" rows={2} placeholder={en ? "Input" : "Ввід"} value={publicInput} onChange={event => setPublicInput(event.target.value)} className={field} /><textarea aria-label="Public output" rows={2} placeholder={en ? "Expected output" : "Очікуваний вивід"} value={publicOutput} onChange={event => setPublicOutput(event.target.value)} className={field} /></div><div className="rounded-xl border border-border p-3"><strong className="text-sm">{en ? "Hidden regression check" : "Прихована регресійна перевірка"}</strong><textarea aria-label="Hidden input" rows={2} placeholder={en ? "Input" : "Ввід"} value={hiddenInput} onChange={event => setHiddenInput(event.target.value)} className={field} /><textarea aria-label="Hidden output" rows={2} placeholder={en ? "Expected output" : "Очікуваний вивід"} value={hiddenOutput} onChange={event => setHiddenOutput(event.target.value)} className={field} /></div></div><button type="button" disabled={busy || !taskTitle.trim() || !taskPrompt.trim() || !publicInput || !hiddenInput} onClick={assignTask} className={`${primary} mt-4`}><Plus className="h-4 w-4" />{en ? "Assign task" : "Призначити задачу"}</button></article>}
      {dossierTab === "task" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.task && <article className={panel}><h3 className="font-bold">{en ? "Technical task result" : "Результат технічного завдання"}</h3><p className="mt-1 text-sm text-text-secondary">{caseView.task.title} · {caseView.task.status} · {caseView.task.executionState ?? (en ? "not checked" : "ще не перевірено")}</p>{caseView.task.result && <p className="mt-2 text-sm">{caseView.task.result.testsPassed}/{caseView.task.result.testsTotal} {en ? "tests passed" : "тестів пройдено"}</p>}{caseView.task.explanation && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{caseView.task.explanation}</p>}{caseView.task.files?.length > 0 && <AssessEvidenceFiles files={caseView.task.files ?? []} />}</article>}
      {dossierTab === "feedback" && (caseRole === "OWNER" || caseRole === "HR") && caseView.status !== "WITHDRAWN" && <>{(caseView.hrReviews ?? []).map((review: any, index: number) => <article key={review.reviewerId ?? index} className={panel}><h3 className="font-bold">{en ? "Reviewer feedback" : "Відгук рецензента"}{review.reviewerUsername ? ` · ${review.reviewerUsername}` : ""}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{review.comment}</p></article>)}{reviewForm(hrReview, setHrReview, en ? "Your HR interview review" : "Твій відгук HR за співбесідою", submitInterviewReview, ["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].includes(caseView.status) && Boolean(caseView.answersSubmittedAt))}</>}
      {dossierTab === "feedback" && (caseRole === "OWNER" || caseRole === "ENGINEER") && caseView.status !== "WITHDRAWN" && caseView.task?.status && ["PASSED", "FAILED"].includes(caseView.task.status) && <>{(caseView.technicalReviews ?? []).map((review: any, index: number) => <article key={review.reviewerId ?? index} className={panel}><h3 className="font-bold">{en ? "Engineering reviewer feedback" : "Відгук інженерного рецензента"}{review.reviewerUsername ? ` · ${review.reviewerUsername}` : ""}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{review.comment}</p></article>)}{reviewForm(techReview, setTechReview, en ? "Your engineering task review" : "Твій відгук інженера за технічним завданням", submitTechnicalReview, true, true)}</>}
      {dossierTab === "feedback" && (caseRole === "OWNER" || caseRole === "HR") && caseView.status !== "WITHDRAWN" && <section className={panel}><h3 className="font-bold">{en ? "Final hiring decision" : "Фінальне рішення щодо кандидата"}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{en ? "Record a human decision with its rationale. Candidate visibility is controlled separately." : "Зафіксуй рішення команди з поясненням. Доступ кандидата до нього налаштовується окремо."}</p><label className="mt-3 block text-sm font-semibold">{en ? "Outcome" : "Результат"}<select value={decisionOutcome} onChange={event => setDecisionOutcome(event.target.value as typeof decisionOutcome)} className={field}><option value="ADVANCE">{en ? "Advance to next step" : "Запросити на наступний етап"}</option><option value="HOLD">{en ? "Hold / need more information" : "Відкласти / потрібна інформація"}</option><option value="REJECT">{en ? "Do not proceed" : "Не продовжувати відбір"}</option></select></label><label className="mt-3 block text-sm font-semibold">{en ? "Decision rationale" : "Пояснення рішення"}<textarea rows={4} maxLength={4000} value={decisionRationale} onChange={event => setDecisionRationale(event.target.value)} className={field} /></label><label className="mt-3 flex items-start gap-2 text-sm text-text-secondary"><input type="checkbox" checked={releaseDecisionToCandidate} onChange={event => setReleaseDecisionToCandidate(event.target.checked)} className="mt-1"/><span>{en ? "Share the outcome and rationale with the candidate and notify them" : "Показати кандидату результат і пояснення та надіслати сповіщення"}</span></label><button type="button" disabled={busy || decisionRationale.trim().length < 12} onClick={saveFinalDecision} className={`${primary} mt-4`}>{en ? "Save decision" : "Зберегти рішення"}</button>{caseView.finalDecision?.decidedAt && <p className="mt-2 text-xs text-text-muted">{en ? "Last saved" : "Останнє збереження"} · {new Date(caseView.finalDecision.decidedAt).toLocaleString(en ? "en-GB" : "uk-UA")}</p>}</section>}
      {dossierTab === "changes" && caseView.status !== "WITHDRAWN" && (caseView.portfolio?.files && caseView.task?.files?.length
        ? <AssessEvidenceComparison before={caseView.portfolio.files} after={caseView.task.files} en={en}/>
        : <div className="assess-panel assess-empty"><Code2 size={25}/><h3>{en ? "Compare after the candidate submits" : "Порівняння після подання роботи"}</h3><p>{en ? "The original version and explicitly submitted files will appear side by side here." : "Тут з’являться поруч вихідна версія та файли, які кандидат явно подав на розгляд."}</p></div>)}
      {caseView.status === "WITHDRAWN" && <p className="rounded-xl border border-accent-warn/30 bg-accent-warn/5 p-4 text-sm">{en ? "The candidate withdrew consent. Private answers and work are no longer available." : "Кандидат відкликав згоду. Приватні відповіді та роботи недоступні."}</p>}
    </section> : null}

    {!candidateCaseId && !assessmentId && !companyId && !creating && <AssessInterviewsHub en={en} compact/>}
    {!candidateCaseId && !assessmentId && company?.id === companyId && (view === "interviews" || view === "kits") && <AssessInterviewsHub key={companyId!} en={en} company={company} library={view === "kits"} initialCaseId={params.get("scheduleFor") ?? undefined}/>}
    {!candidateCaseId && !assessmentId && companyId && (view === "candidates" || view === "assessments" || view === "overview" || view === "integrations") && <div className="flex flex-wrap gap-3 mb-5"><button type="button" className="assess-text-button" onClick={() => changeView("candidates")}>{en ? "Candidate dossiers" : "Досьє кандидатів"}</button><button type="button" className="assess-text-button" onClick={() => changeView("assessments")}>{en ? "Project tasks" : "Завдання до проєктів"}</button><button type="button" className="assess-text-button" onClick={() => changeView("overview")}>{en ? "Process overview" : "Огляд процесу"}</button>{company?.role === "OWNER" && <button type="button" className="assess-text-button" onClick={() => changeView("integrations")}>{en ? "Integrations" : "Інтеграції"}</button>}</div>}
    {!candidateCaseId && !assessmentId && (!companyId || (view !== "interviews" && view !== "kits")) && <AssessDashboard en={en} dashboard={dashboard} company={company} loading={Boolean(companyId && company?.id !== companyId && !error)} view={view} inboxOnly={params.get("view") === "invitations"} creating={creating} busy={busy} companyForm={companyForm} memberForm={memberForm} candidateForm={candidateForm} candidatePage={candidateQuery.page} candidatePageSize={Number(company?.assessmentPageSize ?? 50)} candidateMatchCount={Number(company?.assessmentMatchCount ?? 0)} onCandidateFilter={onCandidateFilter} onCandidatePage={onCandidatePage} openCompany={id => setParams({ company: id, view: "interviews" })} openCandidateCase={visitCandidateCase} openCompanyCase={visitCompanyCase} changeView={changeView} respondMembership={(id, decision) => void respondMembership(id, decision)} updateMemberRole={changeMemberRole} revokeMember={revokeMemberAccess} labelStatus={status => statusLabel[status]?.[en ? 1 : 0] ?? status}/>}
    {!candidateCaseId && !assessmentId && companyId && company?.id === companyId && view === "integrations" && company.role === "OWNER" && <AssessIntegrationsPanel companyId={companyId} en={en}/> }
  </main></AssessWorkspaceShell>;
};
