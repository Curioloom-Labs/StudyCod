import { api } from "./client";

export type GeoStatusResponse = {
  geoBlocked: boolean;
  country: string | null;
};

export async function getGeoStatus(): Promise<GeoStatusResponse> {
  const res = await api.get("/geo");
  const data = res.data ?? {};
  return {
    geoBlocked: data.geoBlocked === true,
    country: typeof data.country === "string" ? data.country : null
  };
}
