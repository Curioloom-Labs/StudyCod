import React, { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { createSupportTicket } from "../lib/api/support";
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export const SupportPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    subject?: string;
    message?: string;
    general?: string;
  }>({});
  const canSubmit = useMemo(() => {
    if (sent || submitting) return false;
    return true;
  }, [sent, submitting]);
  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email обов'язковий";else if (!isValidEmail(email)) next.email = "Невірний формат email";
    if (!subject.trim()) next.subject = "Тема обов'язкова";
    if (!message.trim()) next.message = "Повідомлення обов'язкове";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    try {
      await createSupportTicket({
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim()
      });
      setSent(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Не вдалося відправити звернення";
      setErrors({
        general: String(msg)
      });
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-mono font-bold">Технічна підтримка</h1>
            <p className="text-sm text-text-secondary mt-1">
              Опишіть проблему — ми відповімо на ваш email.
            </p>
          </div>
          <Button variant="ghost" onClick={() => window.location.href = "/"}>На головну</Button>
        </div>

        <div className="mt-4">
          {sent ? <div className="border border-primary bg-bg-code px-4 py-3 font-mono text-sm text-primary">
              Відправлено
            </div> : <form onSubmit={onSubmit} className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              {errors.email && <div className="text-xs text-accent-error font-mono">{errors.email}</div>}

              <Input label="Тема" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Коротко опишіть проблему" required />
              {errors.subject && <div className="text-xs text-accent-error font-mono">{errors.subject}</div>}

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Повідомлення</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Опишіть детально, що саме не працює..." className="w-full min-h-[140px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted" required />
              </div>
              {errors.message && <div className="text-xs text-accent-error font-mono">{errors.message}</div>}

              {errors.general && <div className="border border-accent-error bg-bg-code px-4 py-3 font-mono text-xs text-accent-error">
                  {errors.general}
                </div>}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? "Відправляємо..." : "Відправити"}
                </Button>
              </div>
            </form>}
        </div>
      </Card>
    </div>;
};
export default SupportPage;