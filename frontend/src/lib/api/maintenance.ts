import { api } from "./client";
export type MaintenanceStatusResponse = {
  maintenance: boolean;
  title: string;
  message: string;
  until: string | null;
};
export async function getMaintenanceStatus(): Promise<MaintenanceStatusResponse> {
  const res = await api.get("/auth/maintenance");
  return res.data;
}