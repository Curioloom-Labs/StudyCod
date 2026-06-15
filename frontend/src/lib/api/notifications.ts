import { api } from "./client";

export type NotificationType = "BLOG_COMMENT" | "BLOG_REPLY";

export type AppNotification = {
  id: number;
  type: NotificationType;
  actorName: string | null;
  postSlug: string | null;
  postTitle: string | null;
  commentId: number | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(): Promise<{ notifications: AppNotification[]; unread: number }> {
  const res = await api.get("/notifications");
  return res.data;
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get("/notifications/unread-count");
  return res.data.unread;
}

export async function markNotificationsRead(ids?: number[]): Promise<void> {
  await api.post("/notifications/mark-read", ids ? { ids } : {});
}
