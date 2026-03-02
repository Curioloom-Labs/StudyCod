import { api } from "./client";

export interface CreateSupportTicketRequest {
  email: string;
  subject: string;
  message: string;
}
export interface CreateSupportTicketResponse {
  ok: boolean;
  ticket: {
    id: number;
    status: "OPEN" | "ANSWERED" | "CLOSED";
    createdAt: string;
  };
}
export async function createSupportTicket(data: CreateSupportTicketRequest): Promise<CreateSupportTicketResponse> {
  const res = await api.post("/support/ticket", data);
  return res.data;
}

export type SupportConversationStatus = "OPEN" | "CLOSED";

export type SupportChatConversation = {
  id: number;
  subject: string;
  status: SupportConversationStatus;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt: string;
};

export type SupportChatAttachment = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type SupportChatMessage = {
  id: number;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  text: string;
  createdAt: string;
  attachments: SupportChatAttachment[];
};

export async function listSupportChatConversations(): Promise<{ conversations: SupportChatConversation[] }> {
  const res = await api.get("/support/chat/conversations");
  return res.data;
}

export async function createSupportChatConversation(data: {
  subject: string;
  message: string;
}): Promise<{
  ok: boolean;
  conversation: {
    id: number;
    subject: string;
    status: SupportConversationStatus;
    createdAt: string;
    lastMessageAt: string;
  };
}> {
  const res = await api.post("/support/chat/conversations", data);
  return res.data;
}

export async function getSupportChatConversation(id: number): Promise<{
  conversation: SupportChatConversation;
  messages: SupportChatMessage[];
}> {
  const res = await api.get(`/support/chat/conversations/${id}`);
  return res.data;
}

export async function postSupportChatMessage(conversationId: number, data: {
  text?: string;
  files?: File[];
}): Promise<{
  ok: boolean;
  message: SupportChatMessage;
}> {
  const files = data.files?.filter(Boolean) ?? [];
  const text = (data.text ?? "").toString();

  if (files.length > 0) {
    const form = new FormData();
    if (text.trim()) form.append("text", text);
    for (const f of files) form.append("files", f);
    const res = await api.post(`/support/chat/conversations/${conversationId}/messages`, form);
    return res.data;
  }

  const res = await api.post(`/support/chat/conversations/${conversationId}/messages`, {
    text
  });
  return res.data;
}

export async function closeSupportChatConversation(conversationId: number, reason?: string): Promise<{
  ok: boolean;
  conversation: SupportChatConversation;
}> {
  const res = await api.patch(`/support/chat/conversations/${conversationId}/close`, {
    reason: reason?.trim() || undefined
  });
  return res.data;
}

function parseFilenameFromContentDisposition(v: string | undefined): string | null {
  if (!v) return null;
  // content-disposition: attachment; filename="name.ext"
  const m = v.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
  const raw = (m?.[1] || m?.[2] || m?.[3] || "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/^UTF-8''/i, ""));
  } catch {
    return raw;
  }
}

export async function downloadSupportChatAttachment(attachmentId: number): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(`/support/chat/attachments/${attachmentId}/download`, {
    responseType: "blob"
  });
  const cd = (res.headers as any)?.["content-disposition"] as string | undefined;
  const filename = parseFilenameFromContentDisposition(cd) || `attachment_${attachmentId}`;
  return {
    blob: res.data as Blob,
    filename
  };
}