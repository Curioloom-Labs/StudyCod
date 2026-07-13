import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Clock3, FileCheck2, Save, Sparkles, Wand2 } from "lucide-react";
import { api } from "../../lib/api/client";
import { updateControlWorkFormula } from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { showToast } from "../../lib/toast";

type ControlTask = { id: number; title: string; description?: string; maxAttempts?: number };
type QuizItem = { question?: string; options?: Record<string, string>; correct?: string };
type Control = {
  id: number;
  title?: string | null;
  topic?: { id: number; title: string };
  topicId?: number;
  timeLimitMinutes?: number | null;
  quizJson?: string | null;
  hasTheory?: boolean;
  hasPractice?: boolean;
  formula?: string | null;
  tasks?: ControlTask[];
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10";

const demoQuiz: QuizItem[] = [
  { question: "Яка складність проходу по масиву з n елементів?", options: { A: "O(1)", B: "O(log n)", C: "O(n)" }, correct: "C" },
  { question: "Що поверне range(3) у Python?", options: { A: "0, 1, 2", B: "1, 2, 3", C: "3" }, correct: "A" },
];

const demo: Control = {
  id: 12,
  title: "Контрольна · Колекції",
  topic: { id: 31, title: "Колекції та зрізи" },
  timeLimitMinutes: 45,
  hasTheory: true,
  hasPractice: true,
  formula: "0.35 * test + 0.65 * avg(practice)",
  quizJson: JSON.stringify(demoQuiz, null, 2),
  tasks: [
    { id: 11, title: "Частоти в тексті", description: "Знайдіть кількість кожного слова." },
    { id: 12, title: "Таблиця замовлень", description: "Згрупуйте значення та порахуйте суму." },
  ],
};

function parseQuiz(raw?: string | null): QuizItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
  } catch {
    return [];
  }
}

export const ControlStudioPage: React.FC = () => {
  const { controlWorkId } = useParams<{ controlWorkId: string }>();
  const id = Number(controlWorkId);
  const navigate = useNavigate();
  const [control, setControl] = React.useState<Control | null>(null);
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState("45");
  const [formula, setFormula] = React.useState("");
  const [quizText, setQuizText] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (preview()) {
        setControl(demo);
        setTitle(demo.title || "");
        setMinutes(String(demo.timeLimitMinutes || 45));
        setFormula(demo.formula || "");
        setQuizText(demo.quizJson || "");
        setError(null);
        return;
      }
      const response = await api.get(`/topics/control-works/${id}`);
      const value = response.data.controlWork || response.data;
      setControl(value);
      setTitle(value.title || "");
      setMinutes(String(value.timeLimitMinutes || 45));
      setFormula(value.formula || "0.35 * test + 0.65 * avg(practice)");
      setQuizText(value.quizJson || "");
      setError(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося відкрити контрольну."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (quizText.trim()) JSON.parse(quizText);
      if (!preview()) {
        await api.put(`/topics/control-works/${id}`, {
          title: title.trim(),
          timeLimitMinutes: Number(minutes) || null,
          quizJson: quizText.trim() || null,
        });
        await updateControlWorkFormula(id, formula.trim() || null);
      }
      await load();
      showToast({ type: "success", message: "Контрольну збережено." });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося зберегти зміни. Перевірте JSON квізу."));
    } finally {
      setBusy(false);
    }
  };

  const generateQuiz = async () => {
    setBusy(true);
    try {
      if (preview()) {
        setQuizText(JSON.stringify(demoQuiz, null, 2));
      } else {
        await api.post(`/topics/control-works/${id}/generate-quiz`, { count: 10, topicTitle: control?.topic?.title || title });
        await load();
      }
      showToast({ type: "success", message: "Квіз підготовлено." });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося підготувати квіз."));
    } finally {
      setBusy(false);
    }
  };

  const normalizeQuiz = () => {
    try {
      const parsed = JSON.parse(quizText || "[]");
      setQuizText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError("JSON квізу має помилку. Виправте синтаксис перед збереженням.");
    }
  };

  if (loading) return <div className={root}><div className="h-[600px] animate-pulse rounded-[34px] bg-[#e8eeea] dark:bg-white/[.05]" /></div>;
  if (!control) return <div className={root}>{error || "Контрольну не знайдено."}</div>;

  const tasks = control.tasks || [];
  const quiz = parseQuiz(quizText);
  const hasQuiz = quiz.length > 0;

  return (
    <div className={root}>
      <button onClick={() => navigate(control.topic?.id ? `/edu/topics/${control.topic.id}` : "/edu")} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[#617268] transition hover:text-[#16834d] dark:text-[#aab7ad] dark:hover:text-[#72edb0]"><ArrowLeft className="h-4 w-4" />До теми</button>

      <header className="rounded-[34px] bg-[#fff3e1] p-6 dark:bg-[#302513] sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#b76a00] dark:text-[#ffca7e]">Контрольна точка · {control.topic?.title || "EDU"}</p>
        <div className="mt-3 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-6xl">{control.title || "Контрольна робота"}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#73562a] dark:text-[#decda9]">Одне місце для теорії, практики, квізу й формули оцінювання. Квіз тепер можна не тільки генерувати, а й редагувати.</p>
          </div>
          <div className="rounded-2xl bg-white/75 px-5 py-4 dark:bg-black/15">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-[#8b692c] dark:text-[#d5c39d]">Тривалість</p>
            <p className="mt-1 text-2xl font-bold">{control.timeLimitMinutes || "—"} хв</p>
          </div>
        </div>
      </header>

      {error && <div className="mt-5 rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/[.08] px-4 py-3 text-sm text-[#c4436b] dark:text-[#ff9abd]">{error}</div>}

      <main className="mt-8 grid gap-6 xl:grid-cols-[1fr_390px]">
        <section className="space-y-6">
          <section className="rounded-[30px] border border-[#19291d]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111b14] sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff1dc] text-[#c97600] dark:bg-[#ff8c00]/12 dark:text-[#ffca7e]"><FileCheck2 className="h-5 w-5" /></span>
              <div><p className="text-xs font-bold uppercase tracking-[.13em] text-[#e17800]">Склад роботи</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Що побачить учень</h2></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatusCard active={Boolean(control.hasTheory)} title="Теорія" text={control.hasTheory ? (hasQuiz ? "Квіз готовий." : "Увімкнено, квіз ще не заповнений.") : "Вимкнено."} />
              <StatusCard active={Boolean(control.hasPractice)} title="Практика" text={control.hasPractice ? `${tasks.length} задач у наборі.` : "Вимкнено."} warm />
              <StatusCard active={hasQuiz} title="Квіз" text={hasQuiz ? `${quiz.length} питань.` : "Питань ще немає."} />
            </div>
            <div className="mt-6 space-y-3">
              {tasks.map((task, index) => <div key={task.id} className="flex items-start gap-4 rounded-2xl bg-[#f4f7f4] p-4 dark:bg-white/[.045]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-xs font-extrabold text-[#a55e00] shadow-sm dark:bg-[#18251c] dark:text-[#ffca7e]">{String(index + 1).padStart(2, "0")}</span><div><p className="font-bold">{task.title}</p><p className="mt-1 text-sm leading-6 text-[#708077] dark:text-[#a6b4a9]">{task.description || "Практична частина контрольної."}</p></div></div>)}
              {!tasks.length && <p className="rounded-2xl border border-dashed border-[#19291d]/15 px-5 py-8 text-center text-sm text-[#708077] dark:border-white/10 dark:text-[#a6b4a9]">Практичних задач ще немає.</p>}
            </div>
          </section>

          <section className="rounded-[30px] border border-[#19291d]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111b14] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.13em] text-[#e17800]">Самоперевірка</p>
                <h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Квіз</h2>
                <p className="mt-2 text-sm leading-6 text-[#708077] dark:text-[#a6b4a9]">Редагуйте JSON масив питань. Старий формат `{`question, options, correct`}` підтримується контрольними.</p>
              </div>
              <Sparkles className="h-5 w-5 text-[#e17800]" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void generateQuiz()} className="inline-flex items-center gap-2 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white disabled:opacity-40 dark:bg-[#00d978] dark:text-[#062211]"><Wand2 className="h-4 w-4" />{busy ? "Готуємо…" : hasQuiz ? "Перегенерувати" : "Згенерувати"}</button>
              <button type="button" onClick={normalizeQuiz} className="rounded-xl border border-[#19291d]/10 px-4 py-3 text-sm font-bold dark:border-white/10">Форматувати JSON</button>
            </div>
            <textarea value={quizText} onChange={(event) => setQuizText(event.target.value)} rows={16} spellCheck={false} className="mt-5 w-full resize-y rounded-2xl border border-[#19291d]/10 bg-[#fbfdfb] p-4 font-mono text-xs leading-6 outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#0d1710]" placeholder={'[{"question":"...","options":{"A":"...","B":"..."},"correct":"A"}]'} />
            {hasQuiz && <div className="mt-4 grid gap-2 md:grid-cols-2">{quiz.slice(0, 4).map((item, index) => <div key={`${item.question}-${index}`} className="rounded-2xl bg-[#f4f7f4] p-3 text-sm dark:bg-white/[.045]"><b>{index + 1}. {item.question || "Без питання"}</b><div className="mt-1 text-xs text-[#708077] dark:text-[#a6b4a9]">Правильна: {item.correct || "—"}</div></div>)}</div>}
          </section>
        </section>

        <aside className="rounded-[30px] border border-[#19291d]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111b14]">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">Налаштування</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">Рамка оцінювання</h2>
          <label className="mt-6 block text-sm font-bold">Назва<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#19291d]/10 bg-[#fbfdfb] px-3 py-3 text-sm font-normal dark:border-white/10 dark:bg-[#0d1710]" /></label>
          <label className="mt-4 block text-sm font-bold">Час, хв<input value={minutes} onChange={(event) => setMinutes(event.target.value)} type="number" min="1" className="mt-2 w-full rounded-xl border border-[#19291d]/10 bg-[#fbfdfb] px-3 py-3 text-sm font-normal dark:border-white/10 dark:bg-[#0d1710]" /></label>
          <div className="mt-6 rounded-2xl bg-[#f3f7f3] p-4 dark:bg-white/[.045]">
            <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-[#16834d] dark:text-[#72edb0]" /><p className="text-sm font-bold">Формула результату</p></div>
            <textarea value={formula} onChange={(event) => setFormula(event.target.value)} rows={3} className="mt-3 w-full resize-none rounded-xl border border-[#19291d]/10 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-[#0d1710]" />
            <p className="mt-2 text-xs leading-5 text-[#708077] dark:text-[#a6b4a9]">Наприклад: <code>0.35 * test + 0.65 * avg(practice)</code></p>
          </div>
          <button disabled={busy} onClick={() => void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white disabled:opacity-40 dark:bg-[#00d978] dark:text-[#062211]"><Save className="h-4 w-4" />{busy ? "Зберігаємо…" : "Зберегти"}</button>
        </aside>
      </main>
    </div>
  );
};

const StatusCard: React.FC<{ active: boolean; title: string; text: string; warm?: boolean }> = ({ active, title, text, warm = false }) => (
  <div className={`rounded-2xl p-5 ${active ? warm ? "bg-[#fff4e4] dark:bg-[#ff8c00]/10" : "bg-[#eaf7ee] dark:bg-[#00ff88]/10" : "bg-[#f3f5f3] dark:bg-white/[.045]"}`}>
    <div className="flex items-center gap-2">
      {warm ? <Clock3 className="h-4 w-4 text-[#c97600]" /> : <FileCheck2 className="h-4 w-4 text-[#16834d] dark:text-[#72edb0]" />}
      <p className="text-sm font-bold">{title}</p>
    </div>
    <p className="mt-2 text-sm text-[#64756a] dark:text-[#bdc9c0]">{text}</p>
  </div>
);
