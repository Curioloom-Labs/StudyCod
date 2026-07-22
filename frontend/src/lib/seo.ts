const SITE_URL = "https://studycod.space";
const DEFAULT_DESCRIPTION = "StudyCod — learn by building. Навчайся програмуванню через коротку теорію, практику, підказки та зрозумілий прогрес.";

type SeoLanguage = "uk" | "en";

type SeoData = {
  title: string;
  description: string;
  indexable: boolean;
};

const PUBLIC_SEO: Record<string, SeoData> = {
  "/": {
    title: "StudyCod — learn by building",
    description: DEFAULT_DESCRIPTION,
    indexable: true
  },
  "/docs": {
    title: "Документація StudyCod — навчання програмуванню",
    description: "Інструкції StudyCod для учнів, викладачів і самостійної практики: уроки, задачі, класи, оцінювання та прогрес.",
    indexable: true
  },
  "/pricing": {
    title: "Тарифи StudyCod — плани для навчання програмуванню",
    description: "Оберіть план StudyCod для самостійної практики, викладання програмування або навчання всієї школи.",
    indexable: true
  },
  "/privacy": {
    title: "Політика конфіденційності — StudyCod",
    description: "Як StudyCod обробляє та захищає дані користувачів освітньої платформи.",
    indexable: true
  },
  "/terms": {
    title: "Умови використання — StudyCod",
    description: "Правила користування платформою StudyCod для навчання програмуванню.",
    indexable: true
  },
  "/refunds": {
    title: "Політика повернення коштів — StudyCod",
    description: "Умови повернення коштів, скасування оплати та порядок звернення до StudyCod.",
    indexable: true
  },
  "/cookies": {
    title: "Політика cookies — StudyCod",
    description: "Як StudyCod використовує cookies та локальне сховище для роботи сервісу.",
    indexable: true
  }
};

const PUBLIC_PREFIXES = ["/docs/", "/u/", "/certificate/"];
const PRIVATE_PREFIXES = [
  "/auth",
  "/verify-email",
  "/email-preferences",
  "/edu",
  "/contest",
  "/library",
  "/playground",
  "/learn",
  "/invite",
  "/replay",
  "/profile",
  "/tasks",
  "/grades",
  "/admin",
  "/dashboard",
  "/iad",
  "/difus",
  "/support",
  "/blog",
  "/__dev"
];

function ensureMeta(name: string, content: string, attribute: "name" | "property" = "name"): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

function ensureCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");
  return path || "/";
}

function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function getSeoData(path: string, language: SeoLanguage): SeoData {
  if (isPrivatePath(path)) {
    return {
      title: "StudyCod — learn by building",
      description: DEFAULT_DESCRIPTION,
      indexable: false
    };
  }

  if (PUBLIC_SEO[path]) {
    return PUBLIC_SEO[path];
  }

  if (PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) {
    if (path.startsWith("/docs/")) {
      return {
        title: language === "uk" ? "Гід StudyCod — навчання програмуванню" : "StudyCod Guide — Learn Programming",
        description: language === "uk"
          ? "Практичні інструкції StudyCod для навчання програмуванню, роботи із задачами та розвитку навичок."
          : "Practical StudyCod guides for learning programming, solving tasks, and building stronger coding skills.",
        indexable: true
      };
    }
    if (path.startsWith("/u/")) {
      return {
        title: "Публічний профіль — StudyCod",
        description: "Публічний профіль користувача StudyCod та його навчальні результати.",
        indexable: true
      };
    }
    return {
      title: "Перевірка сертифіката — StudyCod",
      description: "Перевірте сертифікат StudyCod та результати навчання.",
      indexable: true
    };
  }

  return {
    title: "StudyCod — learn by building",
    description: DEFAULT_DESCRIPTION,
    indexable: false
  };
}

function updateStructuredData(path: string, indexable: boolean): void {
  const id = "studycod-seo-structured-data";
  const current = document.getElementById(id);
  if (current) current.remove();
  if (path !== "/" || !indexable) return;

  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "StudyCod",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      slogan: "learn by building",
      description: DEFAULT_DESCRIPTION
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "StudyCod",
      url: SITE_URL,
      slogan: "learn by building",
      description: DEFAULT_DESCRIPTION,
      inLanguage: ["uk", "en"]
    }
  ]);
  document.head.appendChild(script);
}

export function applySeo(pathname: string, language: SeoLanguage, search = ""): void {
  const path = normalizePath(pathname);
  const data = getSeoData(path, language);
  const query = new URLSearchParams(search);
  const hasNonCanonicalQuery = ["auth", "app", "next", "code", "reason", "preview", "__chunk_reload"].some(key => query.has(key));
  const indexable = data.indexable && !hasNonCanonicalQuery;
  const canonical = `${SITE_URL}${path === "/" ? "/" : path}`;

  document.title = data.title;
  document.documentElement.lang = language;
  ensureMeta("description", data.description);
  ensureMeta("robots", indexable ? "index,follow,max-image-preview:large" : "noindex,nofollow");
  ensureMeta("author", "StudyCod");
  ensureMeta("og:type", "website", "property");
  ensureMeta("og:title", data.title, "property");
  ensureMeta("og:description", data.description, "property");
  ensureMeta("og:url", canonical, "property");
  ensureMeta("og:site_name", "StudyCod", "property");
  ensureMeta("og:locale", language === "uk" ? "uk_UA" : "en_US", "property");
  ensureMeta("og:image", `${SITE_URL}/favicon.svg`, "property");
  ensureMeta("twitter:title", data.title);
  ensureMeta("twitter:description", data.description);
  ensureMeta("twitter:image", `${SITE_URL}/favicon.svg`);
  ensureCanonical(canonical);
  updateStructuredData(path, indexable);
}
