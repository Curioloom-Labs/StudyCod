import type { TaskIoType } from '../entities/Task';

export function sanitizeGeneratedTestText(raw: unknown, kind: 'input' | 'output'): string {
  // JSON fields already contain the actual stdin/stdout. A prefix such as
  // "Output:" or a literal backslash-n may be part of the required data.
  const value = String(raw ?? '').replace(/\r\n/g, '\n');
  return kind === 'input' ? value : value.trim();
}

export function compactOutputFormatForLearner(raw: string, _ioType?: TaskIoType | null, _uiLanguage?: 'uk' | 'en'): string {
  // Removing examples/newline wording here used to remove output rules after
  // validation. The displayed contract must retain all validated requirements.
  return String(raw ?? '').replace(/\r\n/g, '\n').trim();
}

export function formatStatementSectionValueForMarkdown(value: string, options?: { preferCodeBlock?: boolean }): string {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  if (!options?.preferCodeBlock) return normalized;
  const runs = normalized.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
  return `${fence}text\n${normalized}\n${fence}`;
}

export function pickNoInputFixedExpectedOutput(params: {
  examples?: Array<{ input?: unknown; output?: unknown }>;
  outputFormat?: unknown;
}): string | null {
  // For generated fixed-output tasks outputFormat is the literal stdout.
  // Examples illustrate this contract; they must never override it.
  const contract = typeof params.outputFormat === 'string' ? params.outputFormat.trim() : '';
  return contract || null;
}
