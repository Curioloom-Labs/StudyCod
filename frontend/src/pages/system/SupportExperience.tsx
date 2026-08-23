import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Clock3, Download, FileText, Image as ImageIcon, LifeBuoy, Paperclip, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import type { SupportChatConversation, SupportChatMessage } from "../../lib/api/support";
import { PublicProductNav } from "../../components/layout/PublicProductNav";
import { useDialogA11y } from "../../components/ui/useDialogA11y";

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
  newFiles: File[];
  composerText: string;
  composerFiles: File[];
  canCreate: boolean;
  canSend: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  newFileInputRef: React.RefObject<HTMLInputElement | null>;
  setNewSubject: (value: string) => void;
  setNewMessage: (value: string) => void;
  setNewFiles: (value: File[]) => void;
  setComposerText: (value: string) => void;
  setComposerFiles: (value: File[]) => void;
  selectConversation: (id: number | null) => void;
  onCreateConversation: (event: React.FormEvent) => void;
  onSendMessage: (event: React.FormEvent) => void;
  onRefresh: () => void;
  onCloseConversation: () => void;
  onReopenConversation: () => void;
  onHome: () => void;
  onDownloadAttachment: (id: number) => void;
  attachmentPreviewUrls: Record<number, string>;
  statusLabel: (status: string) => string;
  senderLabel: (sender: string) => string;
  humanSize: (bytes: number) => string;
};

const darkSurface = "border border-white/[.08] bg-[#111a14] shadow-[0_24px_80px_rgba(0,0,0,.22)]";

const initials = (sender: string) => sender === "USER" ? "ВИ" : "SC";

export const SupportExperience: React.FC<Props> = (props) => {
  const {
    tr, sending, threadLoading, error, conversations, selectedConversationId, selectedConversation, messages,
    newSubject, newMessage, newFiles, composerText, composerFiles, canCreate, canSend, fileInputRef,
    newFileInputRef, setNewSubject, setNewMessage, setNewFiles, setComposerText, setComposerFiles,
    selectConversation, onCreateConversation, onSendMessage, onRefresh, onCloseConversation, onReopenConversation,
    onHome, onDownloadAttachment, attachmentPreviewUrls, statusLabel, senderLabel, humanSize,
  } = props;
  const reduceMotion = useReducedMotion();
  const [category, setCategory] = React.useState<"learning" | "technical" | "billing">("technical");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<{ url: string; name: string } | null>(null);
  const lightboxRef = useDialogA11y({ open: lightbox !== null, onClose: () => setLightbox(null) });

  const categories = [
    { id: "learning" as const, title: tr("Навчання", "Learning"), body: tr("Курси, задачі та прогрес", "Courses, tasks, and progress"), color: "#62edaa" },
    { id: "technical" as const, title: tr("Технічна проблема", "Technical issue"), body: tr("Помилка або дивна поведінка", "Errors and platform behavior"), color: "#ffbd67" },
    { id: "billing" as const, title: tr("Оплата", "Billing"), body: tr("Тарифи та підписка", "Plans and subscription"), color: "#ff91b7" },
  ];

  const beginRequest = (nextCategory: typeof category) => {
    setCategory(nextCategory);
    const prefix = nextCategory === "learning" ? tr("Питання щодо навчання: ", "Learning question: ") : nextCategory === "billing" ? tr("Питання щодо оплати: ", "Billing question: ") : tr("Технічна проблема: ", "Technical issue: ");
    if (!newSubject.trim()) setNewSubject(prefix);
    setComposeOpen(true);
    window.setTimeout(() => document.getElementById("support-compose")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), 30);
  };

  const renderAttachment = (file: SupportChatMessage["attachments"][number]) => {
    const preview = file.mimeType.startsWith("image/") ? attachmentPreviewUrls[file.id] : undefined;
    return <div key={file.id} className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#0b120e]">
      {preview ? <button type="button" onClick={() => setLightbox({ url: preview, name: file.originalName })} className="group block w-full bg-black/20" aria-label={`${tr("Відкрити", "Open")} ${file.originalName}`}><img src={preview} alt={file.originalName} className="max-h-72 w-full object-contain transition duration-300 group-hover:scale-[1.02]" /></button> : <div className="grid h-28 place-items-center bg-[#0b120e] text-[#7e9183]"><FileText className="size-7" /></div>}
      <button type="button" onClick={() => onDownloadAttachment(file.id)} className="flex w-full items-center gap-3 border-t border-white/[.08] px-3 py-2.5 text-left transition hover:bg-white/[.04]"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#00ff88]/10 text-[#62edaa]">{preview ? <ImageIcon className="size-4" /> : <Download className="size-4" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-[#e5eee7]">{file.originalName}</strong><small className="mt-0.5 block text-[10px] text-[#809187]">{humanSize(file.sizeBytes)} · {tr("Завантажити", "Download")}</small></span></button>
    </div>;
  };

  if (selectedConversationId) {
    const open = selectedConversation?.status === "OPEN";
    return <div className="min-h-[100dvh] bg-[#07100a] font-sans text-[#edf5ef]">
      <PublicProductNav active="support" />
      <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mb-5 flex items-center justify-between gap-3"><button type="button" onClick={() => selectConversation(null)} className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.035] px-3.5 py-2.5 text-xs font-semibold text-[#aabaae] transition hover:bg-white/[.07] hover:text-white"><ArrowLeft className="size-4" />{tr("Усі звернення", "All requests")}</button><div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.035] px-3 py-2 text-xs font-semibold text-[#9cab9f]"><span className={`size-2 rounded-full ${open ? "bg-[#00e981] shadow-[0_0_12px_#00e981]" : "bg-[#718078]"}`} />{selectedConversation ? statusLabel(selectedConversation.status) : ""}</div></div>
        <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className={`${darkSurface} h-fit rounded-[26px] p-5 lg:sticky lg:top-24`}>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-[#62edaa]"><LifeBuoy className="size-4" />{tr("Техпідтримка", "Support")}</div>
            <h1 className="mt-5 break-words text-2xl font-bold leading-tight tracking-[-.04em]">{selectedConversation?.subject || tr("Звернення", "Request")}</h1>
            <div className="mt-5 space-y-3 border-t border-white/[.08] pt-5 text-xs text-[#829287]"><div className="flex items-center justify-between gap-3"><span>{tr("Номер", "Request")}</span><strong className="text-[#d5e1d7]">#{selectedConversationId}</strong></div><div className="flex items-center justify-between gap-3"><span>{tr("Створено", "Created")}</span><strong className="text-right text-[#d5e1d7]">{selectedConversation?.createdAt ? new Date(selectedConversation.createdAt).toLocaleDateString() : "—"}</strong></div><div className="flex items-center justify-between gap-3"><span>{tr("Повідомлень", "Messages")}</span><strong className="text-[#d5e1d7]">{messages.length}</strong></div></div>
            <div className="mt-5 rounded-2xl border border-[#00ff88]/10 bg-[#00ff88]/[.06] p-3.5 text-xs leading-5 text-[#a9bcae]"><ShieldCheck className="mb-2 size-4 text-[#62edaa]" />{tr("Не надсилайте паролі або токени. Для діагностики достатньо опису, часу та безпечного скріншота.", "Never send passwords or tokens. A description, time, and safe screenshot are enough for diagnosis.")}</div>
            <button type="button" onClick={open ? onCloseConversation : onReopenConversation} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${open ? "border-white/[.09] text-[#aabaae] hover:bg-white/[.06]" : "border-[#00ff88]/20 bg-[#00ff88]/10 text-[#62edaa] hover:bg-[#00ff88]/15"}`}>{open ? <Check className="size-4" /> : <RotateCcw className="size-4" />}{open ? tr("Позначити вирішеним", "Mark as resolved") : tr("Відкрити знову", "Reopen request")}</button>
          </aside>

          <section className={`${darkSurface} flex min-h-[calc(100dvh-190px)] flex-col overflow-hidden rounded-[26px]`}>
            <header className="flex items-center justify-between gap-4 border-b border-white/[.08] px-5 py-4 sm:px-7"><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#62edaa]">{tr("Діалог зі support", "Support conversation")}</div><div className="mt-1 flex items-center gap-2 text-xs text-[#829287]"><Clock3 className="size-3.5" />{selectedConversation?.createdAt ? new Date(selectedConversation.createdAt).toLocaleString() : ""}</div></div><div className="hidden items-center gap-2 text-[11px] text-[#829287] sm:flex"><span className="size-1.5 rounded-full bg-[#00e981]" />{tr("Відповідь зазвичай протягом робочого дня", "Usually replies within one business day")}</div></header>
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
              {error && <div className="mb-5 rounded-2xl border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3.5 text-xs text-[#ff9aba]">{error}</div>}
              {threadLoading ? <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-white/[.045]" />)}</div> : messages.length ? <div className="space-y-6">{messages.map((message, index) => { const fromUser = message.senderType === "USER"; return <motion.article key={message.id} initial={reduceMotion ? undefined : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 5) * .04 }} className={`flex gap-3 ${fromUser ? "justify-end" : "justify-start"}`}><div className={`flex max-w-[min(680px,92%)] gap-3 ${fromUser ? "flex-row-reverse" : ""}`}><div className={`grid size-9 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold ${fromUser ? "bg-[#00ff88] text-[#062315]" : "bg-[#203c2a] text-[#a8f6c8]"}`}>{initials(message.senderType)}</div><div className={`rounded-[22px] px-4 py-3.5 sm:px-5 ${fromUser ? "bg-[#00d978] text-[#062315]" : "border border-white/[.08] bg-[#17231a] text-[#dce9de]"}`}><div className={`flex items-center gap-2 text-[10px] font-bold ${fromUser ? "text-[#126b42]" : "text-[#8fa095]"}`}><span>{fromUser ? tr("Ви", "You") : senderLabel(message.senderType)}</span><span>·</span><time>{new Date(message.createdAt).toLocaleString()}</time></div>{message.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.text}</p>}{message.attachments?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{message.attachments.map(renderAttachment)}</div> : null}</div></div></motion.article>; })}</div> : <div className="grid min-h-[300px] place-items-center text-center text-sm text-[#829287]">{tr("У цьому зверненні ще немає повідомлень.", "This request has no messages yet.")}</div>}
            </div>
            <form onSubmit={onSendMessage} className="border-t border-white/[.08] bg-[#0d1710] p-3 sm:p-4"><div className="rounded-2xl border border-white/[.1] bg-[#15221a] p-2 focus-within:border-[#00ff88]/35"><div className="flex items-end gap-2"><label className={`grid size-10 shrink-0 place-items-center rounded-xl text-[#93a498] transition ${open ? "cursor-pointer hover:bg-white/[.06] hover:text-[#dce9de]" : "cursor-not-allowed opacity-40"}`}><Paperclip className="size-4" /><input ref={fileInputRef} type="file" multiple disabled={!open} className="hidden" onChange={event => setComposerFiles(Array.from(event.target.files || []))} /></label><textarea value={composerText} onChange={event => setComposerText(event.target.value)} disabled={!open} placeholder={open ? tr("Напишіть відповідь…", "Write a reply…") : tr("Звернення закрите", "Request is closed")} className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-5 text-[#edf5ef] outline-none placeholder:text-[#718177]" /><button type="submit" disabled={!canSend || sending} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#00e981] text-[#062315] transition hover:bg-[#45f4a5] disabled:cursor-not-allowed disabled:opacity-35"><Send className="size-4" /></button></div>{composerFiles.length > 0 && <div className="flex flex-wrap gap-2 px-10 pb-1 pt-2">{composerFiles.map(file => <span key={`${file.name}-${file.size}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white/[.07] px-2 py-1 text-[10px] text-[#b7c7bb]"><Paperclip className="size-3" /><span className="max-w-40 truncate">{file.name}</span><button type="button" onClick={() => setComposerFiles(composerFiles.filter(item => item !== file))} className="text-[#7d9183] hover:text-white"><X className="size-3" /></button></span>)}</div>}</div><div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[#708075]"><span>{tr("Enter — надіслати після введення тексту", "Enter — send after writing")}</span><span>{sending ? tr("Надсилаємо…", "Sending…") : open ? tr("Відкрите звернення", "Open request") : tr("Тільки перегляд", "Read only")}</span></div></form>
          </section>
        </div>
      </main>
      {lightbox && <div data-dialog-a11y="direct" data-material="support-lightbox-scrim" className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightbox(null); }}><div ref={lightboxRef as React.RefObject<HTMLDivElement>} data-dialog-a11y="direct" data-material="support-lightbox" className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0b120e] p-2 shadow-2xl" role="dialog" aria-modal="true" aria-label={lightbox.name} tabIndex={-1} onClick={event => event.stopPropagation()}><button type="button" onClick={() => setLightbox(null)} aria-label={tr("Закрити перегляд", "Close preview")} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" /></button><img src={lightbox.url} alt={lightbox.name} className="max-h-[86vh] max-w-[88vw] object-contain" /><div className="px-2 pb-1 pt-2 text-xs text-[#aebdb1]">{lightbox.name}</div></div></div>}
    </div>;
  }

  return <div className="min-h-[100dvh] bg-[#07100a] font-sans text-[#edf5ef]"><PublicProductNav active="support" /><main className="mx-auto max-w-[1180px] px-4 pb-20 pt-10 sm:px-6 lg:px-8"><div className="rounded-[30px] border border-white/[.08] bg-[radial-gradient(circle_at_85%_15%,rgba(0,255,136,.16),transparent_35%),#111a14] p-7 shadow-[0_30px_100px_rgba(0,0,0,.2)] sm:p-12"><div className="max-w-2xl"><div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-[#62edaa]"><LifeBuoy className="size-4" />{tr("Підтримка", "Support")}</div><h1 className="mt-5 text-4xl font-bold leading-[1.02] tracking-[-.06em] sm:text-6xl">{tr("Що трапилось? Розберімося.", "What happened? Let’s sort it out.")}</h1><p className="mt-5 max-w-xl text-sm leading-6 text-[#9eafa2]">{tr("Опишіть проблему, додайте скріншот — відповідь залишиться в одному зрозумілому діалозі.", "Describe the issue, add a screenshot, and keep every reply in one clear conversation.")}</p></div></div><div className="mt-7 grid gap-3 md:grid-cols-3">{categories.map(item => <button type="button" key={item.id} onClick={() => beginRequest(item.id)} className="group rounded-2xl border border-white/[.08] bg-[#111a14] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[.18] hover:bg-[#162219]"><span className="block size-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 14px ${item.color}` }} /><h2 className="mt-7 text-lg font-bold">{item.title}</h2><p className="mt-1 text-xs text-[#829287]">{item.body}</p></button>)}</div><div className="mt-14 flex items-end justify-between gap-4"><div><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#62edaa]">{tr("Історія", "History")}</div><h2 className="mt-2 text-3xl font-bold tracking-[-.05em]">{tr("Ваші звернення", "Your requests")}</h2></div><button type="button" onClick={onRefresh} className="rounded-xl border border-white/[.09] bg-white/[.035] px-3 py-2 text-xs font-semibold text-[#aabaae] hover:bg-white/[.07]">{tr("Оновити", "Refresh")}</button></div>{error && <div className="mt-5 rounded-2xl border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-4 text-sm text-[#ff9aba]">{error}</div>}<div className="mt-5 grid gap-3 md:grid-cols-2">{props.loading ? [1, 2].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/[.05]" />) : conversations.length ? conversations.map(item => <button type="button" key={item.id} onClick={() => selectConversation(item.id)} className="rounded-2xl border border-white/[.08] bg-[#111a14] p-5 text-left transition hover:border-[#00ff88]/30 hover:bg-[#162219]"><div className="flex items-start justify-between gap-3"><div className="line-clamp-2 font-bold">{item.subject}</div><span className={`mt-1 size-2 shrink-0 rounded-full ${item.status === "OPEN" ? "bg-[#00e981]" : "bg-[#75837a]"}`} /></div><div className="mt-4 flex items-center justify-between text-xs text-[#829287]"><span>{new Date(item.lastMessageAt).toLocaleDateString()}</span><span>{statusLabel(item.status)}</span></div></button>) : <div className={`${darkSurface} col-span-full rounded-2xl p-8 text-center text-sm text-[#829287]`}>{tr("Поки немає звернень. Почніть з категорії вище.", "No requests yet. Start with a category above.")}</div>}</div><motion.section id="support-compose" initial={false} animate={{ height: composeOpen ? "auto" : 0, opacity: composeOpen ? 1 : 0, marginTop: composeOpen ? 32 : 0 }} className="overflow-hidden"><div className="rounded-2xl border border-white/[.08] bg-[#111a14] p-5 sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#62edaa]">{categories.find(item => item.id === category)?.title}</div><h2 className="mt-2 text-2xl font-bold">{tr("Нове звернення", "New request")}</h2></div><button type="button" onClick={() => setComposeOpen(false)} className="grid size-9 place-items-center rounded-xl text-[#829287] hover:bg-white/[.06] hover:text-white"><X className="size-4" /></button></div><form onSubmit={onCreateConversation} className="space-y-3"><input value={newSubject} onChange={event => setNewSubject(event.target.value)} placeholder={tr("Коротко опишіть тему", "Short subject")} className="h-12 w-full rounded-xl border border-white/[.09] bg-[#0b120e] px-4 text-sm outline-none focus:border-[#00ff88]/40" required /><textarea value={newMessage} onChange={event => setNewMessage(event.target.value)} placeholder={tr("Що сталося? Додайте кроки відтворення…", "What happened? Add reproduction steps…")} className="min-h-36 w-full resize-y rounded-xl border border-white/[.09] bg-[#0b120e] p-4 text-sm leading-6 outline-none focus:border-[#00ff88]/40" required /><div className="flex flex-wrap items-center justify-between gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/[.09] px-3 py-2.5 text-xs font-semibold text-[#aabaae] hover:bg-white/[.05]"><Paperclip className="size-4" />{tr("Додати файл", "Add file")}<input ref={newFileInputRef} type="file" multiple className="hidden" onChange={event => setNewFiles(Array.from(event.target.files || []))} /></label>{newFiles.length ? <span className="text-xs text-[#829287]">{newFiles.length} {tr("файл(и) готові", "file(s) ready")}</span> : null}<button type="submit" disabled={!canCreate || sending} className="inline-flex items-center gap-2 rounded-xl bg-[#00e981] px-4 py-3 text-xs font-bold text-[#062315] disabled:opacity-40">{sending ? tr("Створюємо…", "Creating…") : tr("Надіслати звернення", "Send request")}<Send className="size-4" /></button></div>{error && <p className="text-xs text-[#ff9aba]">{error}</p>}</form></div></motion.section></main></div>;
};

export default SupportExperience;
