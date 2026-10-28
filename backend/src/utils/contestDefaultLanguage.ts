/** Imported multi-language templates can coexist with a legacy JAVA column. */
export function contestDefaultLanguage<T extends string>(
  task: { lang?: string; templatesByLanguage?: Record<string, string> | null },
  supported: readonly T[],
): T {
  const legacy = (task.lang === "PYTHON" ? "python" : task.lang === "CPP" ? "cpp" : "java") as T;
  const templates = task.templatesByLanguage ?? {};
  const configured = Object.keys(templates).filter(
    (language): language is T => supported.includes(language as T) && Boolean(templates[language]?.trim()),
  );
  if (configured.length) return configured.includes(legacy) ? legacy : configured[0];
  return supported.includes(legacy) ? legacy : supported[0];
}
