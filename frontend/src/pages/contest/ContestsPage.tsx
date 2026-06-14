import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Search, Trophy, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
import { createContest, joinContestByCode, listContests, type ContestListItem, type ContestVisibility } from "../../lib/api/contests";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
const getErrorMessage = (error: unknown): string => getErrorMessageFromUnknown(error, "");

function fmtDate(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function contestState(c: ContestListItem): "UPCOMING" | "RUNNING" | "FINISHED" {
  const now = Date.now();
  const s = c.startsAt ? new Date(c.startsAt).getTime() : null;
  const e = c.endsAt ? new Date(c.endsAt).getTime() : null;
  if (s != null && now < s) return "UPCOMING";
  if (e != null && now > e) return "FINISHED";
  return "RUNNING";
}

export const ContestsPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";

  const hasToken = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [contests, setContests] = React.useState<ContestListItem[]>([]);
  const [q, setQ] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [joinOpen, setJoinOpen] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joinCode, setJoinCode] = React.useState("");

  const [newTitle, setNewTitle] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newVisibility, setNewVisibility] = React.useState<ContestVisibility>("PUBLIC");
  const [newJoinCode, setNewJoinCode] = React.useState("");
  const [newClassId, setNewClassId] = React.useState("");
  const [newStartsAt, setNewStartsAt] = React.useState("");
  const [newEndsAt, setNewEndsAt] = React.useState("");
  const [newAllowUpsolve, setNewAllowUpsolve] = React.useState(true);
  const [newPublished, setNewPublished] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    listContests()
      .then((r) => {
        if (!alive) return;
        setContests(Array.isArray(r.contests) ? r.contests : []);
      })
      .catch(() => {
        if (!alive) return;
        setContests([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const resetCreateForm = React.useCallback(() => {
    setCreateError(null);
    setNewTitle("");
    setNewDescription("");
    setNewVisibility("PUBLIC");
    setNewJoinCode("");
    setNewClassId("");
    setNewStartsAt("");
    setNewEndsAt("");
    setNewAllowUpsolve(true);
    setNewPublished(false);
  }, []);

  const resetJoinForm = React.useCallback(() => {
    setJoinError(null);
    setJoinCode("");
  }, []);

  const submitJoin = async () => {
    if (!hasToken) {
      setJoinError(tr("Увійдіть, щоб приєднуватись.", "Log in to join contests."));
      return;
    }
    const code = joinCode.trim();
    if (!code) {
      setJoinError(tr("Введіть код доступу.", "Enter join code."));
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const res = await joinContestByCode(code);
      setJoinOpen(false);
      resetJoinForm();
      navigate(`/contests/${res.contestId}`);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setJoinError(msg || tr("Невірний код", "Invalid code"));
    } finally {
      setJoining(false);
    }
  };

  const toIsoOrUndef = (v: string): string | undefined => {
    const raw = String(v ?? "").trim();
    if (!raw) return undefined;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  };

  const submitCreate = async () => {
    if (!hasToken) {
      setCreateError(tr("Увійдіть, щоб створювати контести.", "Log in to create contests."));
      return;
    }

    const title = newTitle.trim();
    if (title.length < 3) {
      setCreateError(tr("Назва занадто коротка", "Title is too short"));
      return;
    }

    if (newVisibility === "PRIVATE_CODE" && newJoinCode.trim().length < 4) {
      setCreateError(tr("Для контесту за кодом потрібен join code (мін. 4 символи).", "Private contests require a join code (min 4 chars)."));
      return;
    }

    if (newVisibility === "CLASS") {
      const cid = Number(newClassId);
      if (!Number.isFinite(cid) || cid <= 0) {
        setCreateError(tr("Для контесту класу потрібен classId.", "Class contests require classId."));
        return;
      }
    }

    const startsAt = toIsoOrUndef(newStartsAt);
    const endsAt = toIsoOrUndef(newEndsAt);
    if (startsAt && endsAt) {
      const s = new Date(startsAt).getTime();
      const e = new Date(endsAt).getTime();
      if (Number.isFinite(s) && Number.isFinite(e) && e < s) {
        setCreateError(tr("Кінець не може бути раніше старту.", "End cannot be before start."));
        return;
      }
    }

    setCreating(true);
    setCreateError(null);
    try {
      const classId = newVisibility === "CLASS" ? Number(newClassId) : undefined;
      const res = await createContest({
        title,
        description: newDescription.trim() ? newDescription.trim() : undefined,
        visibility: newVisibility,
        joinCode: newVisibility === "PRIVATE_CODE" ? newJoinCode.trim() : undefined,
        classId,
        startsAt,
        endsAt,
        allowUpsolve: newAllowUpsolve,
        isPublished: newPublished,
      });
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/contests/${res.id}`);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCreateError(
        msg === "ONLY_USERS"
          ? tr("Створювати контести можуть лише вчителі/користувачі (не студент).", "Only teacher/user accounts can create contests (not students).")
          : msg || tr("Не вдалося створити контест", "Failed to create contest")
      );
    } finally {
      setCreating(false);
    }
  };

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contests;
    return contests.filter((c) => {
      const text = `${c.title} ${c.description ?? ""}`.toLowerCase();
      return text.includes(needle);
    });
  }, [contests, q]);

  const counts = React.useMemo(() => {
    let live = 0;
    let upcoming = 0;
    for (const c of contests) {
      const s = contestState(c);
      if (s === "RUNNING") live++;
      else if (s === "UPCOMING") upcoming++;
    }
    return { live, upcoming, total: contests.length };
  }, [contests]);

  return (
    <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
      >
        <div className="mb-2">
          <Button variant="ghost" onClick={() => navigate("/")} title={tr("Назад", "Back")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
        </div>

        <PageEyebrow label={tr("Контести", "Contests")} />

        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{tr("Контести", "Contests")}</h1>
            </div>
            <p className="mt-1.5 text-sm text-text-secondary max-w-xl">
              {tr("Список доступних контестів.", "List of available contests.")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-sm">
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                <span className="relative inline-flex h-2 w-2">
                  {counts.live > 0 && !prefersReducedMotion ? (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-primary"
                      animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    />
                  ) : null}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${counts.live > 0 ? "bg-primary" : "bg-text-muted"}`} />
                </span>
                <span className="text-text-primary font-semibold">{counts.live}</span>
                {tr("живих", "live")}
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                <span className="h-2 w-2 rounded-full bg-secondary" />
                <span className="text-text-primary font-semibold">{counts.upcoming}</span>
                {tr("скоро", "upcoming")}
              </span>
              <span className="text-text-muted">
                {tr("Всього", "Total")}: <span className="text-text-primary">{counts.total}</span>
              </span>
            </div>
          </div>

          <div className="w-full lg:max-w-xl flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary/40 transition-fast"
                placeholder={tr("Пошук...", "Search...")}
                aria-label={tr("Пошук контестів", "Search contests")}
              />
            </div>

            {hasToken ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setJoinOpen(true);
                    setJoinError(null);
                    setJoinCode("");
                  }}
                  title={tr("Приєднатись за кодом", "Join by code")}
                >
                  {tr("Приєднатись", "Join")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreateOpen(true);
                    setCreateError(null);
                  }}
                  title={tr("Створити контест", "Create contest")}
                >
                  {tr("Створити", "Create")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      <Modal
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setJoinError(null);
        }}
        title={tr("Приєднатись за кодом", "Join by code")}
        showCloseButton={true}
      >
        <div className="space-y-4">
          {joinError ? <div className="text-sm text-accent-error">{joinError}</div> : null}

          <Input label={tr("Код доступу", "Join code")} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={tr("Введіть код...", "Enter code...")} />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setJoinOpen(false);
                setJoinError(null);
              }}
              disabled={joining}
            >
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={submitJoin} disabled={joining}>
              {joining ? tr("Приєднання...", "Joining...") : tr("Приєднатись", "Join")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
        title={tr("Створити контест", "Create contest")}
        showCloseButton={true}
      >
        <div className="space-y-4">
          {createError ? <div className="text-sm text-accent-error">{createError}</div> : null}

          <Input label={tr("Назва", "Title")} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={tr("Напр. Spring contest", "e.g. Spring contest")} />

          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="contest-create-description" className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Опис", "Description")}</label>
            <textarea
              id="contest-create-description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={5}
              className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted"
              placeholder={tr("Коротко про правила/формат...", "Short rules/format...")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 w-full">
              <label htmlFor="contest-create-visibility" className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Доступ", "Visibility")}</label>
              <select
                id="contest-create-visibility"
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as ContestVisibility)}
                disabled={creating}
              >
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE_CODE">{tr("За кодом", "By code")}</option>
                <option value="CLASS">Class</option>
              </select>
            </div>

            {newVisibility === "PRIVATE_CODE" ? (
              <Input
                label={tr("Join code", "Join code")}
                value={newJoinCode}
                onChange={(e) => setNewJoinCode(e.target.value)}
                placeholder={tr("Мін. 4 символи", "Min 4 chars")}
              />
            ) : newVisibility === "CLASS" ? (
              <Input
                label={tr("Class ID", "Class ID")}
                value={newClassId}
                onChange={(e) => setNewClassId(e.target.value)}
                placeholder={tr("Напр. 12", "e.g. 12")}
                inputMode="numeric"
              />
            ) : (
              <div />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 w-full">
              <label htmlFor="contest-create-start" className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Старт", "Start")}</label>
              <input
                id="contest-create-start"
                type="datetime-local"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              <label htmlFor="contest-create-end" className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Фініш", "End")}</label>
              <input
                id="contest-create-end"
                type="datetime-local"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-mono text-text-primary">
              <input type="checkbox" checked={newAllowUpsolve} onChange={(e) => setNewAllowUpsolve(e.target.checked)} />
              {tr("Дозволити дорішування після завершення", "Allow upsolve after contest ends")}
            </label>
            <label className="flex items-center gap-2 text-sm font-mono text-text-primary">
              <input type="checkbox" checked={newPublished} onChange={(e) => setNewPublished(e.target.checked)} />
              {tr("Опублікувати одразу", "Publish immediately")}
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              disabled={creating}
            >
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? tr("Створення...", "Creating...") : tr("Створити", "Create")}
            </Button>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Trophy} title={tr("Поки що немає контестів.", "No contests yet.")} />
      ) : isAurora ? (
        <motion.div
          variants={prefersReducedMotion ? undefined : staggerContainer}
          initial={prefersReducedMotion ? undefined : "initial"}
          animate={prefersReducedMotion ? undefined : "animate"}
          className="rounded-[var(--aurora-radius)] border border-border bg-bg-surface/50 overflow-hidden divide-y divide-border"
        >
          {filtered.map((c) => {
            const state = contestState(c);
            const dot = state === "RUNNING" ? "bg-primary" : state === "UPCOMING" ? "bg-secondary" : "bg-text-muted";
            const stateLabel = state === "RUNNING" ? tr("Йде", "Live") : state === "UPCOMING" ? tr("Скоро", "Upcoming") : tr("Завершено", "Finished");
            return (
              <motion.button
                key={c.id}
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                onClick={() => navigate(`/contests/${c.id}`)}
                className="group w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-bg-hover transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              >
                <span className="relative inline-flex h-2.5 w-2.5 shrink-0" title={stateLabel}>
                  {state === "RUNNING" && !prefersReducedMotion ? (
                    <motion.span className="absolute inset-0 rounded-full bg-primary" animate={{ scale: [1, 2.4], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />
                  ) : null}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-text-primary truncate group-hover:text-primary transition-fast">{c.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-text-muted">
                    <span className="uppercase tracking-[0.08em]">{stateLabel}</span>
                    <span>· {c.startsAt ? fmtDate(c.startsAt, i18n.language) : "—"} → {c.endsAt ? fmtDate(c.endsAt, i18n.language) : "—"}</span>
                    {c.allowUpsolve ? <span>· {tr("Дорішування", "Upsolve")}</span> : null}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-fast" />
              </motion.button>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          variants={prefersReducedMotion ? undefined : staggerContainer}
          initial={prefersReducedMotion ? undefined : "initial"}
          animate={prefersReducedMotion ? undefined : "animate"}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {filtered.map((c) => {
            const state = contestState(c);

            const ribbon =
              state === "RUNNING" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-primary">
                  <span className="relative inline-flex h-2 w-2">
                    {!prefersReducedMotion ? (
                      <motion.span
                        className="absolute inset-0 rounded-full bg-primary"
                        animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                      />
                    ) : null}
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  {tr("Йде", "Live")}
                </span>
              ) : state === "UPCOMING" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-secondary">
                  <span className="h-2 w-2 rounded-full bg-secondary" />
                  {tr("Скоро", "Upcoming")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-text-muted">
                  <span className="h-2 w-2 rounded-full bg-text-muted" />
                  {tr("Завершено", "Finished")}
                </span>
              );

            const visBadge =
              c.visibility === "PUBLIC" ? (
                <Badge color="info">Public</Badge>
              ) : c.visibility === "PRIVATE_CODE" ? (
                <Badge color="warn">{tr("За кодом", "Code")}</Badge>
              ) : (
                <Badge color="info">Class</Badge>
              );

            return (
              <motion.button
                key={c.id}
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                onClick={() => navigate(`/contests/${c.id}`)}
                className="group w-full text-left rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <div className="flex items-start justify-between gap-3">
                  {ribbon}
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {visBadge}
                    {c.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
                  </div>
                </div>

                <div className="mt-3 font-semibold text-text-primary truncate">{c.title}</div>

                {c.description ? <div className="text-sm text-text-secondary mt-1.5 line-clamp-2">{c.description}</div> : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-text-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    {tr("Старт", "Start")}: {c.startsAt ? fmtDate(c.startsAt, i18n.language) : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-text-muted" />
                    {tr("Фініш", "End")}: {c.endsAt ? fmtDate(c.endsAt, i18n.language) : "—"}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <span className="inline-flex items-center gap-1.5 text-sm font-mono text-primary opacity-70 group-hover:opacity-100 transition-fast">
                    {tr("Відкрити", "Open")}
                    <ArrowRight className="w-4 h-4 transition-fast group-hover:translate-x-0.5" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};
