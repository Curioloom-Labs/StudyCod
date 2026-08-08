import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Bug, Clock3, CreditCard, FileText, LifeBuoy, MessageCircle, Paperclip, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import type { SupportChatConversation, SupportChatMessage } from "../../lib/api/support";
import { Logo } from "../../components/Logo";
import { PublicProductNav } from "../../components/layout/PublicProductNav";

type Translate = (uk: string, en: string) => string;

type Props = {
  tr: Translate;
  loading: boolean;
  sending: boolean;
  threadLoading: boolean;
  error: string | null;
  conversations: SupportChatConversation[];
  selectedConversationId: number | null;
  selectedConversation: SupportChatConversation | null;
  messages: SupportChatMessage[];
  newSubject: string;
  newMessage: string;
  composerText: string;
  composerFiles: File[];
  canCreate: boolean;
  canSend: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setNewSubject: (value: string) => void;
  setNewMessage: (value: string) => void;
  setComposerText: (value: string) => void;
  setComposerFiles: (value: File[]) => void;
  selectConversation: (id: number | null) => void;
  onCreateConversation: (event: React.FormEvent) => void;
  onSendMessage: (event: React.FormEvent) => void;
  onRefresh: () => void;
  onCloseConversation: () => void;
  onHome: () => void;
  onDownloadAttachment: (id: number) => void;
  statusLabel: (status: string) => string;
  senderLabel: (sender: string) => string;
  humanSize: (bytes: number) => string;
};

const surface = "border border-[#122017]/10 bg-white dark:border-white/10 dark:bg-[#151c17]";

export const SupportExperience: React.FC<Props> = (props) => {
  const {
    tr, loading, sending, threadLoading, error, conversations, selectedConversationId,
    selectedConversation, messages, newSubject, newMessage, composerText, composerFiles,
    canCreate, canSend, fileInputRef, setNewSubject, setNewMessage, setComposerText,
    setComposerFiles, selectConversation, onCreateConversation, onSendMessage, onRefresh,
    onCloseConversation, onHome, onDownloadAttachment, statusLabel, senderLabel, humanSize,
  } = props;
  const reduceMotion = useReducedMotion();
  const [category, setCategory] = React.useState<"learning" | "technical" | "billing">("technical");
  const [composeOpen, setComposeOpen] = React.useState(false);

  const categories = [
    { id: "learning" as const, Icon: BookOpen, title: tr("Навчання", "Learning"), body: tr("Курси, задачі й прогрес", "Courses, tasks, and progress"), accent: "text-[#00884a] bg-[#00ff88]/12" },
    { id: "technical" as const, Icon: Bug, title: tr("Технічне", "Technical"), body: tr("Помилки та робота платформи", "Errors and platform behavior"), accent: "text-[#b96300] bg-[#ff8c00]/12" },
    { id: "billing" as const, Icon: CreditCard, title: tr("Оплата", "Billing"), body: tr("Тарифи та підписка", "Plans and subscription"), accent: "text-[#c94370] bg-[#ff6b9d]/12" },
  ];

  const beginRequest = (nextCategory: typeof category) => {
    setCategory(nextCategory);
    const prefix = nextCategory === "learning" ? tr("Питання щодо навчання: ", "Learning question: ") : nextCategory === "billing" ? tr("Питання щодо оплати: ", "Billing question: ") : tr("Технічна проблема: ", "Technical issue: ");
    if (!newSubject.trim()) setNewSubject(prefix);
    setComposeOpen(true);
    window.setTimeout(() => document.getElementById("support-compose")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), 30);
  };

  if (selectedConversationId) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] [&_h1]:font-sans [&_h2]:font-sans dark:bg-[#0b100d] dark:text-[#edf3ef]">
        <PublicProductNav active="support" />
        <header className="sticky top-[72px] z-20 border-b border-[#122017]/[.07] bg-[#f7f8f5]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b100d]/90">
          <div className="mx-auto flex h-[72px] w-[min(1040px,calc(100%_-_32px))] items-center justify-between gap-4">
            <button onClick={() => selectConversation(null)} className="flex items-center gap-2 text-[13px] font-bold text-[#667169] transition hover:text-[#111814] dark:text-[#9da9a1] dark:hover:text-white"><ArrowLeft className="size-4" />{tr("Усі звернення", "All requests")}</button>
            <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${selectedConversation?.status === "OPEN" ? "bg-[#00b963]" : "bg-[#8c9890]"}`} /><span className="text-[11px] font-semibold text-[#667169] dark:text-[#9da9a1]">{selectedConversation?.status ? statusLabel(selectedConversation.status) : ""}</span></div>
          </div>
        </header>

        <main className="mx-auto w-[min(860px,calc(100%_-_32px))] pb-40 pt-14">
          <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 16 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}>
            <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{tr("Звернення", "Request")} #{selectedConversationId}</span>
            <h1 className="mt-3 text-balance text-[clamp(34px,5vw,52px)] font-bold leading-[1.05] tracking-[-.05em]">{selectedConversation?.subject ?? tr("Діалог з підтримкою", "Support conversation")}</h1>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] text-[#758179] dark:text-[#89968d]"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{selectedConversation?.createdAt ? new Date(selectedConversation.createdAt).toLocaleString() : ""}</span><span>·</span><span>{tr("Відповіді зберігаються в одному timeline", "Replies stay in one timeline")}</span></div>
          </motion.div>

          {error && <div className="mt-8 rounded-2xl border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-4 text-[13px] text-[#c94370] dark:text-[#ff91b7]">{error}</div>}

          <div className="relative mt-14 before:absolute before:bottom-0 before:left-[23px] before:top-0 before:w-px before:bg-[#122017]/10 dark:before:bg-white/10">
            {threadLoading ? <div className="space-y-8 pl-16"><div className="h-24 animate-pulse rounded-2xl bg-[#e6eae4] dark:bg-[#1b231d]" /><div className="h-28 animate-pulse rounded-2xl bg-[#e6eae4] dark:bg-[#1b231d]" /></div> : messages.map((message, index) => {
              const fromUser = message.senderType === "USER";
              return <motion.article key={message.id} initial={reduceMotion ? undefined : { opacity: 0, y: 14 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="relative pb-10 pl-16"><span className={`absolute left-2 top-0 grid size-8 place-items-center rounded-full border-[4px] border-[#f7f8f5] text-[9px] font-extrabold dark:border-[#0b100d] ${fromUser ? "bg-[#00ff88] text-[#062315]" : "bg-[#101713] text-white ring-1 ring-white/15"}`}>{fromUser ? tr("ВИ", "YOU") : "SC"}</span><div className={`${surface} rounded-[22px] p-5 shadow-[0_14px_38px_rgba(18,32,23,.045)] dark:shadow-[0_14px_38px_rgba(0,0,0,.16)]`}><div className="flex items-center justify-between gap-4"><strong className="text-[12px]">{senderLabel(message.senderType)}</strong><time className="text-[9px] text-[#7a867e] dark:text-[#849188]">{new Date(message.createdAt).toLocaleString()}</time></div>{message.text && <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-[#465249] dark:text-[#c2cbc5]">{message.text}</p>}{message.attachments?.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{message.attachments.map(file => <button key={file.id} onClick={() => onDownloadAttachment(file.id)} className="flex items-center gap-3 rounded-[14px] border border-[#122017]/10 bg-[#f7f8f5] p-3 text-left dark:border-white/10 dark:bg-[#101612]"><span className="grid size-9 place-items-center rounded-xl bg-[#00ff88]/10 text-[#00884a] dark:text-[#62ecaa]"><FileText className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{file.originalName}</strong><small className="mt-1 block text-[9px] text-[#7a867e]">{humanSize(file.sizeBytes)}</small></span></button>)}</div> : null}</div></motion.article>;
            })}
          </div>
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#122017]/10 bg-[#f7f8f5]/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b100d]/90">
          <form onSubmit={onSendMessage} className="mx-auto flex w-full max-w-[860px] items-end gap-2 rounded-[20px] border border-[#122017]/10 bg-white p-2 shadow-[0_18px_55px_rgba(18,32,23,.11)] dark:border-white/10 dark:bg-[#151c17] dark:shadow-[0_18px_55px_rgba(0,0,0,.3)]">
            <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[14px] text-[#667169] transition hover:bg-[#edf0eb] dark:text-[#9da9a1] dark:hover:bg-[#202821]"><Paperclip className="size-4" /><input ref={fileInputRef} type="file" multiple className="hidden" onChange={event => setComposerFiles(Array.from(event.target.files || []))} /></label>
            <div className="min-w-0 flex-1"><textarea value={composerText} onChange={event => setComposerText(event.target.value)} disabled={selectedConversation?.status === "CLOSED"} placeholder={selectedConversation?.status === "CLOSED" ? tr("Звернення закрито", "Request closed") : tr("Додайте відповідь…", "Add a reply…")} className="max-h-36 min-h-11 w-full resize-none bg-transparent px-2 py-3 text-[13px] leading-5 outline-none" />{composerFiles.length > 0 && <span className="px-2 text-[9px] text-[#7a867e]">{composerFiles.length} {tr("файл(и) готові", "file(s) ready")}</span>}</div>
            <button type="submit" disabled={!canSend} className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#00ff88] text-[#06150d] shadow-[0_8px_20px_rgba(0,185,99,.18)] disabled:opacity-40"><Send className="size-4" /></button>
          </form>
          {selectedConversation?.status === "OPEN" && <button onClick={onCloseConversation} className="mx-auto mt-2 block text-[10px] font-semibold text-[#7a867e] hover:text-[#ff6b9d]">{tr("Позначити питання вирішеним", "Mark as resolved")}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="support" />
      <header className="hidden">
        <button onClick={onHome} className="flex items-center gap-2.5 text-lg font-bold tracking-[-.04em]"><span className={`grid size-9 place-items-center rounded-xl ${surface}`}><Logo size={24} /></span>StudyCod <span className="font-normal text-[#8a958d]">/ {tr("турбота", "care")}</span></button>
        <button onClick={onRefresh} disabled={loading} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] dark:border-white/10 dark:bg-[#151c17] dark:text-[#9da9a1]"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
      </header>

      <main>
        <section className="mx-auto w-[min(1180px,calc(100%_-_32px))] pt-14">
          <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 18 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[32px] bg-[#101713] px-[clamp(24px,6vw,80px)] py-[clamp(54px,8vw,94px)] text-white shadow-[0_35px_90px_rgba(12,25,17,.16)]">
            <div className="absolute -right-32 -top-40 size-[420px] rounded-full bg-[#00ff88]/10 blur-[90px]" /><div className="absolute -bottom-44 left-1/3 size-[360px] rounded-full bg-[#ff8c00]/10 blur-[100px]" />
            <div className="relative max-w-[760px]"><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[11px] font-semibold text-[#b6c0b9]"><Sparkles className="size-3.5 text-[#62efaa]" />{tr("Людська підтримка, коли вона потрібна", "Human support when you need it")}</span><h1 className="mt-7 text-balance text-[clamp(42px,6vw,72px)] font-bold leading-[.98] tracking-[-.055em]">{tr("З чим допомогти сьогодні?", "How can we help today?")}</h1><p className="mt-6 max-w-[620px] text-[16px] leading-7 text-[#aab5ad]">{tr("Оберіть напрям — ми одразу додамо контекст і спрямуємо звернення потрібній команді.", "Choose a topic—we’ll add the right context and route your request to the right team.")}</p></div>
          </motion.div>
        </section>

        <section className="mx-auto w-[min(1040px,calc(100%_-_32px))] py-20">
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">{categories.map(({ id, Icon, title, body, accent }) => <button key={id} onClick={() => beginRequest(id)} className={`${surface} group rounded-[22px] p-5 text-left shadow-[0_14px_40px_rgba(18,32,23,.04)] transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(18,32,23,.08)] dark:shadow-[0_14px_40px_rgba(0,0,0,.16)]`}><span className={`grid size-11 place-items-center rounded-[14px] ${accent}`}><Icon className="size-5" /></span><div className="mt-8 flex items-end justify-between gap-4"><div><h2 className="text-[18px] font-bold tracking-[-.035em]">{title}</h2><p className="mt-1 text-[11px] text-[#7a867e] dark:text-[#8e9a92]">{body}</p></div><ArrowRight className="size-4 text-[#8a958d] transition group-hover:translate-x-1 group-hover:text-[#00a85c]" /></div></button>)}</div>

          <div className="mt-20 flex items-end justify-between gap-4"><div><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{tr("Історія", "History")}</span><h2 className="mt-2 text-[32px] font-bold tracking-[-.045em]">{tr("Ваші звернення", "Your requests")}</h2></div><button onClick={() => beginRequest(category)} className="flex h-11 items-center gap-2 rounded-[14px] bg-[#00ff88] px-4 text-[12px] font-bold text-[#06150d]"><Plus className="size-4" />{tr("Нове", "New")}</button></div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">{loading ? Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-[22px] bg-[#e5e9e3] dark:bg-[#1b231d]" />) : conversations.length ? conversations.map(item => <button key={item.id} onClick={() => selectConversation(item.id)} className={`${surface} group rounded-[22px] p-5 text-left transition hover:border-[#00b963]/25`}><div className="flex items-start justify-between gap-4"><span className={`grid size-10 place-items-center rounded-[13px] ${item.status === "OPEN" ? "bg-[#00ff88]/12 text-[#00884a] dark:text-[#62ecaa]" : "bg-[#edf0eb] text-[#7a867e] dark:bg-[#202821]"}`}><MessageCircle className="size-4" /></span><span className="flex items-center gap-1.5 text-[9px] text-[#7a867e]"><span className={`size-1.5 rounded-full ${item.status === "OPEN" ? "bg-[#00b963]" : "bg-[#8a958d]"}`} />{statusLabel(item.status)}</span></div><h3 className="mt-6 line-clamp-2 text-[16px] font-bold tracking-[-.025em]">{item.subject}</h3><div className="mt-3 flex items-center justify-between text-[10px] text-[#7a867e]"><span>{new Date(item.lastMessageAt).toLocaleDateString()}</span><span className="flex items-center gap-1 font-bold text-[#00884a] opacity-0 transition group-hover:opacity-100 dark:text-[#62ecaa]">{tr("Відкрити", "Open")}<ArrowRight className="size-3" /></span></div></button>) : <div className={`${surface} col-span-full rounded-[24px] px-6 py-14 text-center`}><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#00ff88]/10 text-[#00884a] dark:text-[#62ecaa]"><LifeBuoy className="size-5" /></span><h3 className="mt-4 text-[15px] font-bold">{tr("Жодних відкритих питань", "No open questions")}</h3><p className="mt-2 text-[11px] text-[#7a867e]">{tr("Коли знадобиться допомога, почніть із категорії вище.", "When you need help, start with a category above.")}</p></div>}</div>

          <motion.section id="support-compose" initial={false} animate={{ height: composeOpen ? "auto" : 0, opacity: composeOpen ? 1 : 0, marginTop: composeOpen ? 80 : 0 }} className="overflow-hidden">
            <div className="grid grid-cols-[.72fr_1.28fr] gap-12 rounded-[28px] bg-[#101713] p-[clamp(24px,5vw,60px)] text-white max-md:grid-cols-1 max-md:gap-8"><div><span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[.06] text-[#62efaa]"><MessageCircle className="size-5" /></span><h2 className="mt-7 text-[34px] font-bold leading-[1.06] tracking-[-.045em]">{tr("Дайте нам контекст", "Give us context")}</h2><p className="mt-4 text-[13px] leading-6 text-[#aab5ad]">{tr("Конкретний заголовок і кілька кроків відтворення допомагають відповісти значно швидше.", "A precise title and a few reproduction steps help us respond much faster.")}</p></div><form onSubmit={onCreateConversation} className="space-y-4"><div><label className="mb-2 block text-[11px] font-bold text-[#c2cbc5]">{tr("Коротка тема", "Short subject")}</label><input value={newSubject} onChange={event => setNewSubject(event.target.value)} className="h-12 w-full rounded-[14px] border border-white/10 bg-white/[.06] px-4 text-[13px] outline-none focus:border-[#00e97c]/45" required /></div><div><label className="mb-2 block text-[11px] font-bold text-[#c2cbc5]">{tr("Що відбулося?", "What happened?")}</label><textarea value={newMessage} onChange={event => setNewMessage(event.target.value)} className="min-h-[150px] w-full resize-y rounded-[14px] border border-white/10 bg-white/[.06] p-4 text-[13px] leading-6 outline-none focus:border-[#00e97c]/45" required /></div>{error && <p className="text-[11px] text-[#ff8fb6]">{error}</p>}<div className="flex justify-end"><button type="submit" disabled={!canCreate || sending} className="flex h-12 items-center gap-2 rounded-[14px] bg-[#00ff88] px-5 text-[12px] font-bold text-[#06150d] disabled:opacity-50">{sending ? tr("Створюємо…", "Creating…") : tr("Надіслати звернення", "Send request")}<ArrowRight className="size-4" /></button></div></form></div>
          </motion.section>
        </section>
      </main>
    </div>
  );
};

export default SupportExperience;
