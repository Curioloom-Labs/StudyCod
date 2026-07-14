import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ukTranslations from './locales/uk';
import enTranslations from './locales/en';
import { getInitialLanguage, LANGUAGE_STORAGE_KEY } from './lib/localization';

const savedLanguage = getInitialLanguage();
i18n.use(initReactI18next).init({
  resources: {
    uk: {
      translation: ukTranslations
    },
    en: {
      translation: enTranslations
    }
  },
  lng: savedLanguage,
  fallbackLng: {
    en: ['en'],
    uk: ['uk'],
    default: ['en']
  },
  interpolation: {
    escapeValue: false
  }
});
i18n.on('languageChanged', lng => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    document.documentElement.lang = lng === 'en' ? 'en' : 'uk';
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = savedLanguage === 'en' ? 'en' : 'uk';
}
export function tr(uk: string, en: string): string {
  const lng = (i18n.language || 'en').toLowerCase();
  return lng.startsWith('en') ? en : uk;
}
export default i18n;
