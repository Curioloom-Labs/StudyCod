import { api } from "./client";

export type SupportDeskStatus = "OPEN" | "CLOSED";

export type SupportDeskConversation = {
  id: number;
  userEmail: string;
  subject: string;
  status: SupportDeskStatus;
  createdAt: string;
  lastMessageAt: string;
};

export type SupportDeskAttachment = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type SupportDeskMessage = {
  id: number;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  text: string;
  createdAt: string;
  attachments: SupportDeskAttachment[];
};

export type SupportDeskTicket = {
  id: number;
  userEmail: string;
  subject: string;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  createdAt: string;
  answeredAt: string | null;
};

const deskPath = "/support/desk";

export async function listSupportDeskConversations(): Promise<{ conversations: SupportDeskConversation[] }> {
  const res = await api.get(`${deskPath}/conversations`);
  return res.data;
}

export async function getSupportDeskConversation(conversationId: number): Promise<{
  conversation: SupportDeskConversation;
  messages: SupportDeskMessage[];
}> {
  const res = await api.get(`${deskPath}/conversations/${conversationId}`);
  return res.data;
}

export async function postSupportDeskMessage(conversationId: number, data: {
  text: string;
  sendEmail?: boolean;
}): Promise<{
  ok: boolean;
  emailSent?: boolean;
  message: { id: number; senderType: "ADMIN"; text: string; createdAt: string };
}> {
  const res = await api.post(`${deskPath}/conversations/${conversationId}/messages`, data);
  return res.data;
}

export async function updateSupportDeskConversationStatus(conversationId: number, status: SupportDeskStatus): Promise<{ ok: boolean; conversation: SupportDeskConversation }> {
  const res = await api.patch(`${deskPath}/conversations/${conversationId}/status`, { status });
  return res.data;
}

export async function listSupportDeskTickets(): Promise<{ tickets: SupportDeskTicket[] }> {
  const res = await api.get(deskPath);
  return res.data;
}

export async function replySupportDeskTicket(id: number, replyText: string): Promise<{ ok: boolean; ticket: SupportDeskTicket }> {
  const res = await api.post(`${deskPath}/${id}/reply`, { replyText });
  return res.data;
}
