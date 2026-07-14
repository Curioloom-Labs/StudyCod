export const LANGUAGE_STORAGE_KEY = "studycod_language";
export const COUNTRY_STORAGE_KEY = "studycod_country";
export const COUNTRY_EVENT = "studycod:country";

export type SupportedLanguage = "en" | "uk";
export type SupportedCurrency = "USD" | "UAH";

export function normalizeCountry(country: string | null | undefined): string | null {
  const value = String(country || "").trim();
  return value ? value.toUpperCase() : null;
}

export function isUkraineCountry(country: string | null | undefined): boolean {
  const value = normalizeCountry(country);
  return value === "UA" || value === "UKR" || value === "UKRAINE";
}

export function getStoredLanguagePreference(): SupportedLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" || saved === "uk" ? saved : null;
  } catch {
    return null;
  }
}

export function getInitialLanguage(): SupportedLanguage {
  return getStoredLanguagePreference() || "en";
}

export function getStoredCountry(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeCountry(localStorage.getItem(COUNTRY_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setDetectedCountry(country: string | null | undefined): string | null {
  const normalized = normalizeCountry(country);
  if (typeof window === "undefined") return normalized;
  try {
    if (normalized) {
      localStorage.setItem(COUNTRY_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(COUNTRY_STORAGE_KEY);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, {
    detail: { country: normalized }
  }));
  return normalized;
}

export function getCurrencyForCountry(country: string | null | undefined): SupportedCurrency {
  return isUkraineCountry(country) ? "UAH" : "USD";
}
