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