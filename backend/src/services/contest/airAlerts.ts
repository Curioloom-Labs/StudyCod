import { createHash } from "node:crypto";

export type AirAlertLocation = {
  uid: number;
  name: string;
  type: string;
  oblastUid: number | null;
};

type TryvohaRegion = {
  id: number;
  slug: string;
  type: string;
  name_uk: string;
  oblast_slug: string | null;
};

type ActiveAlert = {
  slug: string;
  type?: string;
  name_uk?: string;
  level?: string;
  started_at?: string;
  oblast_slug?: string | null;
};

const API_BASE = "https://tryvoha.online/api/v1";
const REGIONS_TTL_MS = 60 * 60_000;
const ACTIVE_ALERTS_TTL_MS = 30_000;

let regionsCache: { value: TryvohaRegion[]; expiresAt: number } | null = null;
let regionsRequest: Promise<TryvohaRegion[]> | null = null;
let activeAlertsCache: { value: ActiveAlert[]; expiresAt: number } | null = null;
let activeAlertsRequest: Promise<ActiveAlert[]> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("AIR_ALERT_PROVIDER_UNAVAILABLE");
    return await response.json() as T;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("AIR_ALERT_PROVIDER_")) throw error;
    throw new Error("AIR_ALERT_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRegions(): Promise<TryvohaRegion[]> {
  const now = Date.now();
  if (regionsCache && regionsCache.expiresAt > now) return regionsCache.value;
  if (regionsRequest) return regionsRequest;

  regionsRequest = (async () => {
    try {
      const payload = await fetchJson<{ regions?: unknown }>("/regions");
      if (!Array.isArray(payload?.regions)) throw new Error("AIR_ALERT_PROVIDER_INVALID_RESPONSE");
      const regions = payload.regions.filter((region): region is TryvohaRegion =>
        isRecord(region)
        && Number.isSafeInteger(Number(region.id))
        && typeof region.slug === "string"
        && typeof region.type === "string"
        && typeof region.name_uk === "string",
      ).map((region) => ({
        id: Number(region.id),
        slug: region.slug,
        type: region.type,
        name_uk: region.name_uk,
        oblast_slug: typeof region.oblast_slug === "string" ? region.oblast_slug : null,
      }));
      if (!regions.length) throw new Error("AIR_ALERT_PROVIDER_INVALID_RESPONSE");
      regionsCache = { value: regions, expiresAt: Date.now() + REGIONS_TTL_MS };
      return regions;
    } finally {
      regionsRequest = null;
    }
  })();
  return regionsRequest;
}

async function fetchActiveAlerts(): Promise<ActiveAlert[]> {
  const now = Date.now();
  if (activeAlertsCache && activeAlertsCache.expiresAt > now) return activeAlertsCache.value;
  if (activeAlertsRequest) return activeAlertsRequest;

  activeAlertsRequest = (async () => {
    try {
      const payload = await fetchJson<{ alerts?: unknown }>("/alerts");
      if (!Array.isArray(payload?.alerts)) throw new Error("AIR_ALERT_PROVIDER_INVALID_RESPONSE");
      const alerts = payload.alerts.map((alert): ActiveAlert => {
        if (!isRecord(alert) || typeof alert.slug !== "string") throw new Error("AIR_ALERT_PROVIDER_INVALID_RESPONSE");
        return {
          slug: alert.slug,
          type: typeof alert.type === "string" ? alert.type : undefined,
          name_uk: typeof alert.name_uk === "string" ? alert.name_uk : undefined,
          level: typeof alert.level === "string" ? alert.level : undefined,
          started_at: typeof alert.started_at === "string" ? alert.started_at : undefined,
          oblast_slug: typeof alert.oblast_slug === "string" ? alert.oblast_slug : null,
        };
      });
      activeAlertsCache = { value: alerts, expiresAt: Date.now() + ACTIVE_ALERTS_TTL_MS };
      return alerts;
    } finally {
      activeAlertsRequest = null;
    }
  })();
  return activeAlertsRequest;
}

function locationFromRegion(region: TryvohaRegion): AirAlertLocation {
  const type = region.type === "district"
    ? "Район"
    : region.type === "community"
      ? "Громада"
      : /область|республіка/i.test(region.name_uk)
        ? "Область"
        : "Місто";
  return {
    uid: region.id,
    name: region.name_uk,
    type,
    oblastUid: null,
  };
}

function regionsByUid(regions: TryvohaRegion[]): Map<number, TryvohaRegion> {
  return new Map(regions.map((region) => [region.id, region]));
}

export function isAirAlertProviderConfigured(): boolean {
  // Tryvoha.online exposes a documented public API that does not require a key.
  return true;
}

export async function listAirAlertLocations(): Promise<AirAlertLocation[]> {
  const regions = await fetchRegions();
  return regions
    .filter((region) => region.type !== "community")
    .map(locationFromRegion)
    .sort((a, b) => a.name.localeCompare(b.name, "uk-UA"));
}

export async function getActiveAirRaidAlert(locationUid: number): Promise<{
  key: string;
  locationName: string;
  startedAt: string | null;
} | null> {
  const [regions, alerts] = await Promise.all([fetchRegions(), fetchActiveAlerts()]);
  const selectedRegion = regionsByUid(regions).get(Number(locationUid));
  if (!selectedRegion) throw new Error("AIR_ALERT_LOCATION_NOT_FOUND");

  const matching = alerts
    .filter((alert) => alert.slug === selectedRegion.slug || (
      selectedRegion.type === "state" && alert.oblast_slug === selectedRegion.slug
    ))
    .sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
  if (!matching.length) return null;

  const fingerprint = createHash("sha256")
    .update(matching.map((alert) => `${alert.slug}:${alert.started_at ?? ""}:${alert.level ?? ""}`).join("|"))
    .digest("hex");
  const selectedLocation = locationFromRegion(selectedRegion);
  return {
    key: fingerprint,
    locationName: matching.length === 1 ? String(matching[0].name_uk ?? selectedLocation.name) : selectedLocation.name,
    startedAt: matching[0].started_at ?? null,
  };
}
