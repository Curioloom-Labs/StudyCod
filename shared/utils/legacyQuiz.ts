const labels = ['А', 'Б', 'В', 'Г', 'Д'];
export function normalizeLegacyAnswer(value: unknown): string {
  if (typeof value === 'number' || /^\d$/.test(String(value))) return labels[Number(value)] ?? '';
  const key = String(value ?? '').trim().toUpperCase();
  const latin = ['A', 'B', 'C', 'D', 'E'].indexOf(key);
  return latin >= 0 ? labels[latin] : key;
}
export function legacyStudentQuestions(raw?: string | null): Array<{ question: string; options: Record<string, string> }> {
  try {
    const parsed = JSON.parse(raw || '[]');
    const items = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(items)) return [];
    return items.map(item => ({ question: String(item.question ?? item.q ?? ''), options: Object.fromEntries(Object.entries(item.options ?? {}).map(([key, value]) => [normalizeLegacyAnswer(key), String(value ?? '')])) }));
  } catch { return []; }
}
