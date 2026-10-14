import React from "react";
import { useIsPresent } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { CredentialWorkflowModal } from "./CredentialWorkflowModal";
import { tr } from "../../i18n";
import type { useClassCredentialRecovery } from "./useClassCredentialRecovery";

export function ClassCredentialRecoveryPanel({ recovery, credentialsVisible }: { recovery: ReturnType<typeof useClassCredentialRecovery>; credentialsVisible: boolean }) {
  const isPresent = useIsPresent();
  const pending = ["PENDING", "NOT_FOUND"].includes(recovery.status?.state || ""), expired = recovery.status?.state === "EXPIRED", finishing = recovery.active?.phase === "ACK";
  return <>
    {!credentialsVisible && (recovery.active || recovery.error || recovery.available.length > 0) && <aside role="status" className="rounded-2xl border border-border bg-bg-surface p-4">
      <p className="font-bold">{tr("Попередня видача доступів", "Previous access operation")}</p>
      <p className="mt-1 text-sm text-text-secondary">{recovery.error || tr("Перевірте результат перед створенням нових акаунтів або паролів.", "Check the result before creating new accounts or passwords.")}</p>
      <Button className="mt-3 min-h-11" disabled={recovery.busy || recovery.discovering} onClick={() => void recovery.check()}>{tr("Перевірити результат", "Check result")}</Button>
    </aside>}
    <CredentialWorkflowModal open={isPresent && recovery.showPrompt && !credentialsVisible} title={tr("Відновлення доступів учнів", "Recover student access")} onClose={() => recovery.setShowPrompt(false)} closable={!recovery.busy} showCloseButton={false} panelClassName="max-w-xl">
      <div className="space-y-4">
        {finishing ? <p>{tr("Дані вже позначено збереженими. Потрібно завершити підтвердження на сервері.", "The details were marked as saved. Finish confirming this on the server.")}</p> : expired ? <>
          <p>{tr("Зміни попередньої дії вже застосовані. Її паролі більше не можна відновити.", "The previous operation was applied. Its passwords can no longer be recovered.")}</p>
          <p className="text-sm text-text-secondary">{tr("Нові паролі замінять попередні паролі класу лише для учнів, які ще в цьому класі. Особисті паролі самостійно приєднаних учнів залишаться чинними.", "New passwords replace the previous class passwords only for students still in this class. Personal passwords of self-enrolled students stay unchanged.")}</p>
        </> : <p>{tr("Запит міг виконатися, навіть якщо відповідь не надійшла. Перевірка поверне готові дані без повторного створення учнів чи зміни пароля.", "The request may have completed even if its response was lost. Checking returns the saved details without creating students or changing passwords again.")}</p>}
        {recovery.error && <p role="alert" className="text-sm text-accent-error">{recovery.error}</p>}
        <div className="flex flex-wrap gap-3">
          {finishing ? <Button className="min-h-11" disabled={recovery.busy} onClick={() => void recovery.acknowledge()}>{tr("Завершити видачу", "Finish issuing access")}</Button> : <>
            <Button className="min-h-11" disabled={recovery.busy} onClick={() => void recovery.check()}>{recovery.busy ? tr("Перевіряємо…", "Checking…") : tr("Перевірити результат", "Check result")}</Button>
            {pending && recovery.canRetry && <Button className="min-h-11" variant="ghost" disabled={recovery.busy} onClick={() => void recovery.retry()}>{tr("Повторити той самий запит", "Retry the same request")}</Button>}
            {pending && <Button className="min-h-11" variant="ghost" disabled={recovery.busy} onClick={() => void recovery.cancel()}>{tr("Скасувати незавершену дію", "Cancel unfinished operation")}</Button>}
            {expired && <Button className="min-h-11" disabled={recovery.busy || !recovery.status?.eligibleStudentIds?.length} onClick={() => void recovery.resetExpired()}>{tr("Створити нові паролі", "Create new passwords")}</Button>}
            {expired && <Button className="min-h-11" variant="ghost" disabled={recovery.busy} onClick={() => void recovery.acknowledge()}>{tr("Закрити відновлення", "Close recovery")}</Button>}
          </>}
          <Button className="min-h-11" variant="ghost" disabled={recovery.busy} onClick={() => recovery.setShowPrompt(false)}>{tr("До списку класу", "Back to class roster")}</Button>
        </div>
      </div>
    </CredentialWorkflowModal>
  </>;
}
