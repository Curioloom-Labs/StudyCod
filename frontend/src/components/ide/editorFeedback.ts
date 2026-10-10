export type MobilePane = "condition" | "code" | "result";
export type IdeSaveStatus = "saved" | "dirty" | "saving" | "error";

export function reconcileMobilePaneAfterResult(currentPane: MobilePane): {
  pane: MobilePane;
  unread: boolean;
} {
  if (currentPane === "code") return { pane: "result", unread: false };
  return { pane: currentPane, unread: currentPane !== "result" };
}

export function getIdeSaveStatusLabel(
  status: IdeSaveStatus | undefined,
  lastSavedAt: string | null | undefined,
  labels: Record<IdeSaveStatus, string>,
  formatTimestamp: (timestamp: string) => string,
): string | null {
  if (!status) return null;
  if (status !== "saved" || !lastSavedAt) return labels[status];
  return `${labels.saved} ${formatTimestamp(lastSavedAt)}`;
}
