import { api } from "./client";

export type AdminMaterialsLanguage = "JAVA" | "PYTHON" | "CPP";
export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  userMode: "PERSONAL" | "EDUCATIONAL";
  role: "USER" | "TEACHER" | "SYSTEM_ADMIN";
  lang: "JAVA" | "PYTHON";
  difus: number;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
export interface AdminUserResponse {
  user: AdminUser;
}
export interface AdminClass {
  id: number;
  name: string;
  language: "JAVA" | "PYTHON";
  teacherId: number;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
}
export interface AdminClassesResponse {
  classes: AdminClass[];
}
export interface AdminStats {
  users: {
    total: number;
    teachers: number;
    admins: number;
    byMode: {
      PERSONAL: number;
      EDUCATIONAL: number;
    };
  };
  classes: {
    total: number;
  };
}
export type SupportTicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
export type MaintenanceState = {
  enabled: boolean;
  title: string;
  message: string;
  until: string | null;
  updatedAt: string;
};
export interface AdminSupportTicket {
  id: number;
  userEmail: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  createdAt: string;
  answeredAt: string | null;
}

export type AdminSupportConversationStatus = "OPEN" | "CLOSED";

export type AdminSupportChatConversation = {
  id: number;
  userEmail: string;
  subject: string;
  status: AdminSupportConversationStatus;
  createdAt: string;
  lastMessageAt: string;
};

export type AdminSupportChatAttachment = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type AdminSupportChatMessage = {
  id: number;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  text: string;
  createdAt: string;
  attachments: AdminSupportChatAttachment[];
};
export interface CreateUserData {
  username: string;
  email?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  userMode?: "PERSONAL" | "EDUCATIONAL";
  role?: "USER" | "TEACHER" | "SYSTEM_ADMIN";
  lang?: "JAVA" | "PYTHON";
  emailVerified?: boolean;
}
export interface UpdateUserData {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  lang?: "JAVA" | "PYTHON";
}
export interface UpdateUserRoleData {
  role: "USER" | "TEACHER" | "SYSTEM_ADMIN";
}
export interface CreateClassData {
  name: string;
  language: "JAVA" | "PYTHON";
  teacherId: number;
}
export interface UpdateClassData {
  name?: string;
  language?: "JAVA" | "PYTHON";
  teacherId?: number;
}
export async function getAdminUsers(params?: {
  page?: number;
  limit?: number;
  role?: string;
  userMode?: string;
}): Promise<AdminUsersResponse> {
  const res = await api.get("/admin/users", {
    params
  });
  return res.data;
}
export async function getAdminUser(id: number): Promise<AdminUserResponse> {
  const res = await api.get(`/admin/users/${id}`);
  return res.data;
}
export async function createAdminUser(data: CreateUserData): Promise<AdminUserResponse> {
  const res = await api.post("/admin/users", data);
  return res.data;
}
export async function updateAdminUser(id: number, data: UpdateUserData): Promise<AdminUserResponse> {
  const res = await api.patch(`/admin/users/${id}`, data);
  return res.data;
}
export async function updateUserRole(id: number, data: UpdateUserRoleData): Promise<AdminUserResponse> {
  const res = await api.patch(`/admin/users/${id}/role`, data);
  return res.data;
}
export async function deleteAdminUser(id: number): Promise<void> {
  await api.delete(`/admin/users/${id}`);
}
export async function getAdminClasses(): Promise<AdminClassesResponse> {
  const res = await api.get("/admin/classes");
  return res.data;
}
export async function createAdminClass(data: CreateClassData): Promise<{
  class: AdminClass;
}> {
  const res = await api.post("/admin/classes", data);
  return res.data;
}
export async function updateAdminClass(id: number, data: UpdateClassData): Promise<{
  class: AdminClass;
}> {
  const res = await api.patch(`/admin/classes/${id}`, data);
  return res.data;
}
export async function deleteAdminClass(id: number): Promise<void> {
  await api.delete(`/admin/classes/${id}`);
}
export async function getAdminStats(): Promise<AdminStats> {
  const res = await api.get("/admin/stats");
  return res.data;
}
export async function getAdminSupportTickets(): Promise<{
  tickets: AdminSupportTicket[];
}> {
  const res = await api.get("/admin/support");
  return res.data;
}
export async function replyAdminSupportTicket(id: number, data: {
  replyText: string;
}): Promise<{
  ok: boolean;
  ticket: AdminSupportTicket;
}> {
  const res = await api.post(`/admin/support/${id}/reply`, data);
  return res.data;
}

export async function getAdminSupportConversations(): Promise<{ conversations: AdminSupportChatConversation[] }> {
  const res = await api.get("/admin/support/conversations");
  return res.data;
}

export async function getAdminSupportConversation(conversationId: number): Promise<{
  conversation: AdminSupportChatConversation;
  messages: AdminSupportChatMessage[];
}> {
  const res = await api.get(`/admin/support/conversations/${conversationId}`);
  return res.data;
}

export async function postAdminSupportConversationMessage(conversationId: number, data: {
  text: string;
  sendEmail?: boolean;
}): Promise<{
  ok: boolean;
  message: {
    id: number;
    senderType: "ADMIN";
    text: string;
    createdAt: string;
  };
}> {
  const res = await api.post(`/admin/support/conversations/${conversationId}/messages`, data);
  return res.data;
}
export async function getAdminMaintenance(): Promise<{
  state: MaintenanceState;
}> {
  const res = await api.get("/admin/maintenance");
  return res.data;
}
export async function enableAdminMaintenance(data: {
  title: string;
  message: string;
  until: string | null;
}): Promise<{
  ok: boolean;
  state: MaintenanceState;
}> {
  const res = await api.post("/admin/maintenance/enable", data);
  return res.data;
}
export async function disableAdminMaintenance(): Promise<{
  ok: boolean;
  state: MaintenanceState;
}> {
  const res = await api.post("/admin/maintenance/disable");
  return res.data;
}

export type AdminLibraryTaskStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export type AdminLibraryTask = {
  id: number;
  title: string;
  description: string;
  template: string;
  lang: "JAVA" | "PYTHON";
  maxAttempts: number;
  status: AdminLibraryTaskStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: number; username: string; email: string | null } | null;
};

export type AdminTheoryBlock = {
  id: number;
  title: string;
  content: string;
  version: number;
  level: number | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminMaterialTopic = {
  id: number;
  title: string;
  description: string | null;
  order: number;
  language: AdminMaterialsLanguage;
  theoryBlock: AdminTheoryBlock | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminMaterialsDiagnostics = {
  language: AdminMaterialsLanguage;
  topicsNewGlobal: number;
  topicsNewClass: number;
  legacyTopics: number;
};

export async function getAdminMaterialTopics(params?: { language?: AdminMaterialsLanguage }): Promise<{ topics: AdminMaterialTopic[] }> {
  const res = await api.get("/admin/materials/topics", { params });
  return res.data;
}

export async function getAdminMaterialsDiagnostics(params: { language: AdminMaterialsLanguage }): Promise<AdminMaterialsDiagnostics> {
  const res = await api.get("/admin/materials/diagnostics", { params });
  return res.data;
}

export async function createAdminMaterialTopic(data: {
  title: string;
  description?: string | null;
  order?: number;
  language: AdminMaterialsLanguage;
  theory?: { title?: string; content: string; level?: number | null; tags?: any } | null;
}): Promise<{ topic: AdminMaterialTopic }> {
  const res = await api.post("/admin/materials/topics", data);
  return res.data;
}

export async function updateAdminMaterialTopic(
  id: number,
  data: {
    title?: string;
    description?: string | null;
    order?: number;
    language?: AdminMaterialsLanguage;
    theory?: { title?: string; content: string; level?: number | null; tags?: any } | null;
    clearTheory?: boolean;
    theoryRevisionAction?: "UPDATE" | "AUTO";
    theoryRevisionComment?: string;
  }
): Promise<{ topic: AdminMaterialTopic }> {
  const res = await api.patch(`/admin/materials/topics/${id}`, data);
  return res.data;
}

export async function deleteAdminMaterialTopic(id: number): Promise<{ ok: boolean }> {
  const res = await api.delete(`/admin/materials/topics/${id}`);
  return res.data;
}

export async function reorderAdminMaterialTopics(data: {
  language: AdminMaterialsLanguage;
  orderedIds: number[];
}): Promise<{ topics: AdminMaterialTopic[] }> {
  const res = await api.patch("/admin/materials/topics/reorder", data);
  return res.data;
}

export async function importAdminMaterialTopicsYaml(data: {
  language: AdminMaterialsLanguage;
  yaml: string;
  mode?: "merge" | "replace";
}): Promise<{ created: number; updated: number; skipped: number; topics: AdminMaterialTopic[] }> {
  const res = await api.post("/admin/materials/import/yaml", data);
  return res.data;
}

export async function syncAdminMaterialTopicsFromRepo(data: {
  language: AdminMaterialsLanguage;
  mode?: "merge" | "replace";
}): Promise<{ created: number; updated: number; skipped: number; topics: AdminMaterialTopic[]; source?: any }> {
  const res = await api.post("/admin/materials/sync/repo", data);
  return res.data;
}

export async function importAdminMaterialTopicsLegacy(data: {
  language: "JAVA" | "PYTHON";
  mode?: "merge" | "replace";
}): Promise<{ created: number; updated: number; skipped: number; topics: AdminMaterialTopic[] }> {
  const res = await api.post("/admin/materials/import/legacy-topics", data);
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

export async function exportAdminMaterialTopicsYaml(params: {
  language: AdminMaterialsLanguage;
}): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get("/admin/materials/export/yaml", {
    params,
    responseType: "blob"
  });

  const cd = (res.headers as any)?.["content-disposition"] as string | undefined;
  const filename = parseFilenameFromContentDisposition(cd) || `materials_${params.language}.yaml`;
  return { blob: res.data as Blob, filename };
}

export type AdminTheoryBlockRevisionAction = "CREATE" | "UPDATE" | "ROLLBACK" | "AUTO";

export type AdminTheoryBlockRevision = {
  id: number;
  version: number;
  action: AdminTheoryBlockRevisionAction;
  comment: string | null;
  createdAt: string;
  createdByUserId: number | null;
};

export async function getAdminTheoryBlockRevisions(theoryBlockId: number): Promise<{ revisions: AdminTheoryBlockRevision[] }> {
  const res = await api.get(`/admin/materials/theory-blocks/${theoryBlockId}/revisions`);
  return res.data;
}

export async function getAdminTheoryBlockRevision(
  theoryBlockId: number,
  version: number
): Promise<{ revision: AdminTheoryBlockRevision; snapshot: { title: string; content: string; level: number | null; tags: any } | null }> {
  const res = await api.get(`/admin/materials/theory-blocks/${theoryBlockId}/revisions/${version}`);
  return res.data;
}

export async function rollbackAdminTheoryBlockRevision(
  theoryBlockId: number,
  version: number,
  data?: { comment?: string }
): Promise<{ ok: boolean; theoryBlock: AdminTheoryBlock }> {
  const res = await api.post(`/admin/materials/theory-blocks/${theoryBlockId}/revisions/${version}/rollback`, data ?? {});
  return res.data;
}

export type AdminTheoryBlockEnTranslation = {
  id: number;
  titleEn: string | null;
  contentEn: string | null;
  translationVersionEn: number | null;
  translatedAtEn: string | null;
};

export async function translateAdminTheoryBlockToEn(
  theoryBlockId: number,
  data?: { force?: boolean }
): Promise<{ theoryBlock: AdminTheoryBlockEnTranslation }> {
  const res = await api.post(`/admin/materials/theory-blocks/${theoryBlockId}/translate/en`, data ?? {});
  return res.data;
}

export async function getAdminLibraryTasks(params?: { status?: AdminLibraryTaskStatus }): Promise<{ tasks: AdminLibraryTask[] }> {
  const res = await api.get("/admin/library/tasks", { params });
  return res.data;
}

export async function approveAdminLibraryTask(id: number): Promise<{ task: AdminLibraryTask }> {
  const res = await api.post(`/admin/library/tasks/${id}/approve`, {});
  return res.data;
}

export async function rejectAdminLibraryTask(id: number, reason: string): Promise<{ task: AdminLibraryTask }> {
  const res = await api.post(`/admin/library/tasks/${id}/reject`, { reason });
  return res.data;
}

export type AdminBroadcastRecipient = {
  kind: "user" | "student";
  id: number;
  email: string;
};

export type AdminBroadcastDryRunResult = {
  ok: true;
  dryRun: true;
  count: number;
  sample: AdminBroadcastRecipient[];
};

export type AdminBroadcastSendResult = {
  ok: true;
  dryRun: false;
  recipients: number;
  sent: number;
  failed: number;
};

export async function sendAdminBroadcastEmail(data: {
  subject: string;
  title: string;
  delivery?: "MARKETING" | "NOTIFICATION";
  // Mass notification option (delivery=NOTIFICATION only): send to all USERS.
  includeAllUsers?: boolean;
  // Safety confirmation for mass notification sends.
  confirm?: string;
  // Prefer plain text body; backend will convert to safe HTML.
  content?: string;
  // Or provide HTML directly.
  html?: string;
  text?: string;
  includeSubscribed?: boolean;
  audience?: "USERS" | "STUDENTS" | "ALL";
  targets?: {
    userIds?: number[];
    studentIds?: number[];
    classIds?: number[];
    emails?: string[];
  };
  dryRun?: boolean;
  limit?: number;
}): Promise<AdminBroadcastDryRunResult | AdminBroadcastSendResult | any> {
  const res = await api.post("/admin/emails/broadcast", data);
  return res.data;
}

export type AdminMailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

export type AdminMailMessageListItem = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  size: number;
};

export type AdminMailMessageDetails = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  replyTo: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  text: string;
  html: string;
  attachments: Array<{
    filename: string | null;
    contentType: string;
    size: number;
    contentId: string | null;
  }>;
};

export async function getAdminMailStatus(): Promise<{ ok: boolean; issues: string[] }> {
  const res = await api.get("/admin/mail/status");
  return res.data;
}

export async function getAdminMailFolders(): Promise<{ folders: AdminMailFolder[] }> {
  const res = await api.get("/admin/mail/folders");
  return res.data;
}

export async function getAdminMailMessages(params: {
  folder: string;
  limit?: number;
  cursorUid?: number;
}): Promise<{ folder: string; items: AdminMailMessageListItem[]; nextCursorUid: number | null }> {
  const res = await api.get("/admin/mail/messages", { params });
  return res.data;
}

export async function getAdminMailMessage(folder: string, uid: number): Promise<{ message: AdminMailMessageDetails }> {
  const res = await api.get(`/admin/mail/messages/${uid}`, { params: { folder } });
  return res.data;
}

export async function sendAdminMailMessage(data: {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; messageId: string | null }> {
  const res = await api.post("/admin/mail/messages/send", data);
  return res.data;
}

export async function setAdminMailRead(data: {
  folder: string;
  uid: number;
  read: boolean;
}): Promise<{ ok: boolean }> {
  const res = await api.post(`/admin/mail/messages/${data.uid}/read`, {
    folder: data.folder,
    read: data.read,
  });
  return res.data;
}

export async function moveAdminMailMessage(data: {
  folder: string;
  uid: number;
  destination: string;
}): Promise<{ ok: boolean }> {
  const res = await api.post(`/admin/mail/messages/${data.uid}/move`, {
    folder: data.folder,
    destination: data.destination,
  });
  return res.data;
}

export async function deleteAdminMailMessage(data: {
  folder: string;
  uid: number;
}): Promise<{ ok: boolean }> {
  const res = await api.delete(`/admin/mail/messages/${data.uid}`, { params: { folder: data.folder } });
  return res.data;
}