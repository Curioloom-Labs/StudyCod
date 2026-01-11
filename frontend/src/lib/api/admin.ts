import { api } from "./client";
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