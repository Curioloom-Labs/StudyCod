import React from "react";
import { useIsPresent } from "framer-motion";
import { isAxiosError } from "axios";
import { getCredentialOperation, getCredentialOperations, closeCredentialOperation, resetClassStudentPasswords, type CredentialOperationKind, type CredentialOperationSummary, type StudentCredentials } from "../../lib/api/edu";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";

interface Marker { key: string; kind: CredentialOperationKind; phase?: "ACK"; replaces?: { key: string; kind: CredentialOperationKind } }
interface Result { count: number; credentials: StudentCredentials[] }
const kinds = ["CREATE", "IMPORT", "RESET", "RESET_BATCH"];
const validKey = (key: unknown) => typeof key === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
const readMarker = (storageKey: string): Marker | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (!value || !validKey(value.key) || !kinds.includes(value.kind) || value.phase !== undefined && value.phase !== "ACK") return null;
    const replaces = value.replaces && validKey(value.replaces.key) && kinds.includes(value.replaces.kind) ? { key: value.replaces.key, kind: value.replaces.kind } : undefined;
    return { key: value.key, kind: value.kind, ...(value.phase === "ACK" ? { phase: "ACK" as const } : {}), ...(replaces ? { replaces } : {}) };
  } catch { return null; }
};

export function useClassCredentialRecovery(props: { classId: number; userId?: number; onReady: (result: Result, kind: CredentialOperationKind) => void; onPending: () => void; onCancelled: (kind: CredentialOperationKind) => void }) {
  const isPresent = useIsPresent(), presentRef = React.useRef(isPresent); presentRef.current = isPresent;
  const { classId, userId } = props, scope = `${userId || 0}:${classId}`, storageKey = `edu:credential-operation:${scope}`;
  const scopeRef = React.useRef(scope); scopeRef.current = scope;
  const callbacks = React.useRef(props); callbacks.current = props;
  const mounted = React.useRef(true), activeRef = React.useRef<Marker | null>(null), working = React.useRef<string | null>(null);
  const retryRef = React.useRef<{ scope: string; marker: Marker; action: (key: string) => Promise<Result> } | null>(null);
  const [active, setActive] = React.useState<Marker | null>(null), [status, setStatus] = React.useState<CredentialOperationSummary | null>(null);
  const [busy, setBusy] = React.useState(false), [discovering, setDiscovering] = React.useState(true), [showPrompt, setShowPrompt] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const [available, setAvailable] = React.useState<CredentialOperationSummary[]>([]);
  const current = () => mounted.current && presentRef.current && scopeRef.current === scope;
  const remember = (marker: Marker | null) => {
    if (!current()) return;
    activeRef.current = marker; setActive(marker);
    try { if (marker) sessionStorage.setItem(storageKey, JSON.stringify(marker)); else sessionStorage.removeItem(storageKey); } catch { /* Server discovery also retains completed operations. */ }
  };
  const clear = () => { remember(null); retryRef.current = null; setStatus(null); setShowPrompt(false); };
  const showReady = (marker: Marker, result: Result) => {
    if (!current() || activeRef.current?.key !== marker.key || activeRef.current.phase === "ACK") return;
    remember(marker); setError(null); setShowPrompt(false); callbacks.current.onReady(result, marker.kind);
  };
  const probe = async (marker: Marker, prompt = true) => {
    const result = await getCredentialOperation(classId, marker.key);
    if (!current() || activeRef.current?.key !== marker.key) return result;
    setStatus(result); setError(null);
    if (activeRef.current.phase === "ACK") { setShowPrompt(true); return result; }
    if (result.state === "READY" && Array.isArray(result.credentials)) showReady({ ...marker, kind: result.kind || marker.kind }, { count: result.count || result.credentials.length, credentials: result.credentials });
    else if (result.state === "CANCELLED" || result.state === "ACKNOWLEDGED") clear();
    else if (prompt) { remember(marker); setShowPrompt(true); callbacks.current.onPending(); }
    return result;
  };
  const refresh = async () => {
    const result = await getCredentialOperations(classId); if (current()) setAvailable(result); return result;
  };
  const acknowledge = async () => {
    const marker = activeRef.current; if (!marker || working.current === scope) return false;
    working.current = scope; setBusy(true); setError(null); remember({ ...marker, phase: "ACK" });
    try {
      if (marker.replaces) await closeCredentialOperation(classId, marker.replaces.key, marker.replaces.kind, "ack");
      await closeCredentialOperation(classId, marker.key, marker.kind, "ack");
      if (current() && activeRef.current?.key === marker.key) { clear(); void refresh().catch(() => undefined); }
      return true;
    } catch (caught) { if (current()) setError(getEduErrorMessage(caught, tr("Не вдалося завершити видачу доступів. Повторіть завершення.", "Could not finish issuing access. Retry finishing."))); return false; }
    finally { if (working.current === scope) working.current = null; if (current()) setBusy(false); }
  };
  const discover = async () => {
    if (!Number.isSafeInteger(classId) || classId <= 0 || !userId || working.current === scope) { if (current()) setDiscovering(false); return; }
    working.current = scope; setDiscovering(true); setError(null);
    try {
      let marker = readMarker(storageKey);
      if (marker?.phase === "ACK") {
        if (marker.replaces) await closeCredentialOperation(classId, marker.replaces.key, marker.replaces.kind, "ack");
        await closeCredentialOperation(classId, marker.key, marker.kind, "ack");
        if (current()) remember(null); marker = null;
      }
      const list = await refresh();
      marker ||= readMarker(storageKey) || activeRef.current || (list[0] ? { key: list[0].operationKey, kind: list[0].kind } : null);
      if (marker && current()) { remember(marker); await probe(marker); }
    } catch (caught) {
      if (current()) { const stored = readMarker(storageKey); if (stored) remember(stored); setError(getEduErrorMessage(caught, tr("Не вдалося перевірити незавершену видачу доступів.", "Could not check unfinished access operations."))); }
    } finally { if (working.current === scope) working.current = null; if (current()) setDiscovering(false); }
  };
  React.useEffect(() => {
    mounted.current = true; const stored = readMarker(storageKey); activeRef.current = stored; retryRef.current = null; setActive(stored); setStatus(stored ? { operationKey: stored.key, kind: stored.kind, state: "PENDING" } : null); setShowPrompt(false); setAvailable([]); setBusy(false);
    void discover(); return () => { mounted.current = false; };
  }, [scope]); // The callback ref follows current page state without restarting discovery.

  const check = async () => {
    if (working.current === scope) return;
    const marker = activeRef.current; if (!marker) return discover();
    if (marker.phase === "ACK") return acknowledge();
    working.current = scope; setBusy(true);
    try { await probe(marker); } catch (caught) { if (current()) { setError(getEduErrorMessage(caught, tr("Не вдалося перевірити результат. Дані операції збережено; спробуйте ще раз.", "Could not check the result. The operation is retained; try again."))); setShowPrompt(true); } }
    finally { if (working.current === scope) working.current = null; if (current()) setBusy(false); }
  };
  const execute = async (kind: CredentialOperationKind, action: (key: string) => Promise<Result>, replaces?: Marker) => {
    if (!current()) return undefined;
    if (working.current === scope || activeRef.current && !replaces) throw new Error(tr("Спочатку завершіть попередню видачу доступів.", "Finish the previous access operation first."));
    const marker: Marker = { key: crypto.randomUUID(), kind, ...(replaces ? { replaces: { key: replaces.key, kind: replaces.kind } } : {}) };
    remember(marker); retryRef.current = { scope, marker, action }; setStatus({ operationKey: marker.key, kind, state: "PENDING" });
    setBusy(true); setError(null);
    try { const result = await action(marker.key); showReady(marker, result); return result; }
    catch (caught) {
      try {
        const result = await probe(marker, false);
        if (!current()) return undefined;
        if (result.state === "CANCELLED" || result.state === "ACKNOWLEDGED") throw caught;
        if (activeRef.current?.key !== marker.key) return undefined;
        if (result.state === "READY") return { count: result.count || result.credentials?.length || 0, credentials: result.credentials || [] };
        if (result.state === "NOT_FOUND" && isAxiosError(caught) && caught.response && caught.response.status >= 400 && caught.response.status < 500) {
          await closeCredentialOperation(classId, marker.key, marker.kind, "cancel"); if (current()) clear(); throw caught;
        }
        if (current()) { setError(getEduErrorMessage(caught, tr("Відповідь втрачено. Перевірте результат перед новою дією.", "The response was lost. Check the result before starting another operation."))); setShowPrompt(true); callbacks.current.onPending(); }
      } catch (probeError) {
        if (probeError === caught) throw caught;
        if (current() && activeRef.current?.key === marker.key) { setError(getEduErrorMessage(caught, tr("Не вдалося отримати результат. Перевірте попередню дію.", "Could not retrieve the result. Check the previous operation."))); setShowPrompt(true); callbacks.current.onPending(); }
      }
      return undefined;
    } finally { if (current() && working.current !== scope) setBusy(false); }
  };
  const retry = async () => {
    const attempt = retryRef.current; if (!attempt || attempt.scope !== scope || working.current === scope) return;
    working.current = scope; setBusy(true); setError(null);
    try { const result = await attempt.action(attempt.marker.key); showReady(attempt.marker, result); }
    catch (caught) { if (current()) setError(getEduErrorMessage(caught, tr("Не вдалося повторити дію. Перевірте результат або скасуйте незавершену дію.", "Could not retry the operation. Check the result or cancel it."))); }
    finally { if (working.current === scope) working.current = null; if (current()) setBusy(false); }
  };
  const cancel = async () => {
    const marker = activeRef.current; if (!marker || working.current === scope) return;
    working.current = scope; setBusy(true); setError(null);
    try { await closeCredentialOperation(classId, marker.key, marker.kind, "cancel"); if (current() && activeRef.current?.key === marker.key) { clear(); callbacks.current.onCancelled(marker.kind); void refresh().catch(() => undefined); } }
    catch (caught) { if (current()) { setError(getEduErrorMessage(caught, tr("Не вдалося скасувати дію. Перевірте її результат.", "Could not cancel the operation. Check its result."))); try { await probe(marker); } catch { /* Keep the original error and the durable marker. */ } } }
    finally { if (working.current === scope) working.current = null; if (current()) setBusy(false); }
  };
  const resetExpired = async () => {
    const marker = activeRef.current, ids = status?.eligibleStudentIds || [];
    if (!marker || !ids.length || working.current === scope) return;
    try { await execute("RESET_BATCH", key => resetClassStudentPasswords(classId, ids, key), marker); }
    catch (caught) { if (current()) { remember(marker); setShowPrompt(true); setError(getEduErrorMessage(caught, tr("Не вдалося відновити доступ. Оновіть список учнів і спробуйте ще раз.", "Could not restore access. Refresh the roster and try again."))); } }
  };
  React.useEffect(() => {
    if (!isPresent || !showPrompt || active?.phase === "ACK" || !["PENDING", "NOT_FOUND"].includes(status?.state || "")) return;
    const timer = window.setInterval(() => { if (working.current !== scope) void check(); }, 2000); return () => window.clearInterval(timer);
  }, [isPresent, showPrompt, active?.key, active?.phase, status?.state, scope]);
  return { active, status, busy, discovering, error, available, showPrompt, setShowPrompt, execute, check, retry, cancel, resetExpired, acknowledge,
    canRetry: !!retryRef.current && retryRef.current.scope === scope && retryRef.current.marker.key === active?.key,
    canStart: !active && !available.length && !busy && !discovering && !error, hasUnresolved: !!active };
}
