import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search, Trophy } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
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

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <div className="mb-2">
            <Button variant="ghost" onClick={() => navigate("/")}
              title={tr("Назад", "Back")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-mono text-text-primary">{tr("Контести", "Contests")}</h1>
          </div>
          <div className="text-sm text-text-secondary mt-1">
            {tr(
              "Список доступних контестів.",
              "List of available contests."
            )}
          </div>
        </div>

        <div className="w-full lg:max-w-xl flex flex-col sm:flex-row sm:items-start gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
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

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-1">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 sm:p-6 text-sm text-text-secondary">{tr("Поки що немає контестів.", "No contests yet.")}</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => {
                const state = contestState(c);
                const stateBadge =
                  state === "RUNNING" ? (
                    <Badge color="success">{tr("Йде", "Running")}</Badge>
                  ) : state === "UPCOMING" ? (
                    <Badge color="info">{tr("Скоро", "Upcoming")}</Badge>
                  ) : (
                    <Badge color="warn">{tr("Завершено", "Finished")}</Badge>
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
                  <button
                    key={c.id}
                    onClick={() => navigate(`/contests/${c.id}`)}
                    className="w-full text-left p-4 hover:bg-bg-hover transition-fast"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-mono text-text-primary truncate">{c.title}</div>
                          {stateBadge}
                          {visBadge}
                          {c.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
                        </div>
                        <div className="text-xs text-text-secondary mt-1 flex flex-wrap gap-3">
                          {c.startsAt ? (
                            <span>
                              {tr("Старт", "Start")}: {fmtDate(c.startsAt, i18n.language)}
                            </span>
                          ) : (
                            <span>{tr("Старт", "Start")}: —</span>
                          )}
                          {c.endsAt ? (
                            <span>
                              {tr("Фініш", "End")}: {fmtDate(c.endsAt, i18n.language)}
                            </span>
                          ) : (
                            <span>{tr("Фініш", "End")}: —</span>
                          )}
                        </div>
                        {c.description ? <div className="text-sm text-text-secondary mt-2 line-clamp-2">{c.description}</div> : null}
                      </div>

                      <div className="flex-shrink-0 sm:self-start">
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/contests/${c.id}`);
                          }}
                        >
                          {tr("Відкрити", "Open")}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
