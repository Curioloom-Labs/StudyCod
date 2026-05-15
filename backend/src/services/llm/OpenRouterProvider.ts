import { logger } from '../../utils/logger';
import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { tryFixJsonResponse } from '../../../../shared/utils/taskValidator';
import { AppDataSource } from '../../data-source';
import { User } from '../../entities/User';

type KeyHealthState = {
  cooldownUntilMs: number;
  disabledUntilMs: number;
  consecutiveFailures: number;
  lastStatus?: number;
  lastErrorMessage?: string;
  lastModel?: string;
};

const keyHealthByKey = new Map<string, KeyHealthState>();
let didWarnSuspiciousKeyPrefix = false;
const loggedModelCandidateModes = new Set<'text' | 'json'>();

function envFlag(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function nowMs(): number {
  return Date.now();
}

function getKeyHealth(key: string): KeyHealthState {
  const existing = keyHealthByKey.get(key);
  if (existing) return existing;
  const st: KeyHealthState = {
    cooldownUntilMs: 0,
    disabledUntilMs: 0,
    consecutiveFailures: 0
  };
  keyHealthByKey.set(key, st);
  return st;
}

function parseRetryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  // numeric = seconds
  if (/^\d+$/.test(s)) {
    const sec = Number.parseInt(s, 10);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return sec * 1000;
  }
  // date = HTTP date
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return 0;
  const delta = t - nowMs();
  return delta > 0 ? delta : 0;
}

function normalizeAndDeduplicateKeys(primary: string, backups: string[]): string[] {
  const raw = [primary, ...backups].map(s => String(s ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function normalizeAndDeduplicateModels(models: string[]): string[] {
  const raw = models.map(s => String(s ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of raw) {
    const key = model.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

function looksLikeOpenRouterKey(key: string): boolean {
  const k = String(key ?? '').trim();
  // OpenRouter keys typically start with sk-or- (including sk-or-v1-)
  return /^sk-or-/.test(k);
}
interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  reasoning?: {
    enabled?: boolean;
  };
  response_format?: {
    type: string;
  };
  temperature?: number;
  max_tokens?: number;
}
interface OpenRouterResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | {
        text?: string;
        content?: string;
      } | Array<{
        type?: string;
        text?: string;
        content?: string;
      }>;
      reasoning?: string;
      tool_calls?: Array<{
        function?: {
          arguments?: string;
        };
      }>;
    };
    delta?: {
      content?: string | Array<{
        type?: string;
        text?: string;
        content?: string;
      }>;
    };
    reasoning?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

function summarizeOpenRouterResponseShape(response: OpenRouterResponse): string {
  try {
    const c = response.choices?.[0];
    if (!c) return 'no-choices';
    const msg = c.message;
    const contentType = Array.isArray(msg?.content) ? 'array' : typeof msg?.content;
    const deltaType = Array.isArray(c.delta?.content) ? 'array' : typeof c.delta?.content;
    return [
      `choice.keys=${Object.keys(c).join(',') || 'none'}`,
      `message.keys=${msg ? Object.keys(msg).join(',') : 'none'}`,
      `message.content=${contentType}`,
      `delta.content=${deltaType}`,
      `choice.text=${typeof c.text}`,
      `choice.reasoning=${typeof c.reasoning}`,
      `message.reasoning=${typeof msg?.reasoning}`
    ].join(' | ');
  } catch {
    return 'shape-unavailable';
  }
}

function extractOpenRouterText(response: OpenRouterResponse): string {
  const firstChoice = response.choices?.[0];
  if (!firstChoice) return '';

  const message = firstChoice.message;
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const text = typeof content.text === 'string' ? content.text : '';
    if (text.trim()) return text;
    const nested = typeof content.content === 'string' ? content.content : '';
    if (nested.trim()) return nested;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map(part => {
        if (typeof part === 'string') return part;
        const text = typeof part?.text === 'string' ? part.text : '';
        if (text) return text;
        const nested = typeof part?.content === 'string' ? part.content : '';
        return nested;
      })
      .join('')
      .trim();
    if (joined) return joined;
  }

  const deltaContent = firstChoice.delta?.content;
  if (typeof deltaContent === 'string' && deltaContent.trim()) {
    return deltaContent;
  }
  if (Array.isArray(deltaContent)) {
    const joinedDelta = deltaContent
      .map(part => {
        const text = typeof part?.text === 'string' ? part.text : '';
        if (text) return text;
        const nested = typeof part?.content === 'string' ? part.content : '';
        return nested;
      })
      .join('')
      .trim();
    if (joinedDelta) return joinedDelta;
  }

  if (typeof firstChoice.text === 'string' && firstChoice.text.trim()) {
    return firstChoice.text;
  }

  if (typeof message?.reasoning === 'string' && message.reasoning.trim()) {
    return message.reasoning;
  }
  if (typeof firstChoice.reasoning === 'string' && firstChoice.reasoning.trim()) {
    return firstChoice.reasoning;
  }

  const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
  if (typeof toolArgs === 'string' && toolArgs.trim()) {
    return toolArgs;
  }

  return '';
}

function extractBalancedJsonObject(text: string): string | null {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseModelJsonOrThrow<T = any>(raw: string): T {
  const content = String(raw ?? '').trim();
  if (!content) {
    throw new Error('Empty JSON response content');
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    // continue with best-effort extraction/repair below
  }

  const balanced = extractBalancedJsonObject(content);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      // continue to existing fixer
    }
  }

  return tryFixJsonResponse(content) as T;
}

function isRateLimitLike(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  return m.includes('rate limit') || m.includes('rate-limited') || m.includes('temporarily rate-limited') || /\b429\b/.test(m);
}

function isReasoningMandatoryError(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  return m.includes('reasoning is mandatory') || (m.includes('reasoning') && m.includes('cannot be disabled'));
}

function isGptOss20bModel(model: string): boolean {
  const normalized = String(model || '').trim().toLowerCase();
  return normalized.includes('openai/gpt-oss-20b');
}

function resolveReasoningPreferenceForModel(model: string): OpenRouterRequest['reasoning'] | undefined {
  if (!isGptOss20bModel(model)) return undefined;

  // For gpt-oss we default to non-reasoning mode unless explicitly enabled.
  const raw = String(process.env.OPENROUTER_REASONING_ENABLED || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return {
      enabled: true
    };
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return {
      enabled: false
    };
  }
  return {
    enabled: false
  };
}
function modelsWithoutSystemSupport(): string[] {
  // Some routed providers (e.g., Google AI Studio) reject system instructions for certain Gemma models.
  // When that happens, we inline system text into the user message.
  return [
    'google/gemma-3-27b-it',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it',
    'google/gemma-3-12b-it:free',
    'google/gemma-3-12b',
    'google/gemma-3-12b:free'
  ];
}
function modelsWithoutJsonMode(): string[] {
  // These models frequently error on OpenAI-style JSON mode / response_format.
  return [
    'google/gemma-3-27b-it',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it',
    'google/gemma-3-12b-it:free',
    'google/gemma-3-12b',
    'google/gemma-3-12b:free'
  ];
}
function normalizeModelForSystemCheck(model: string): string {
  return model.toLowerCase().trim();
}
function isGemmaModel(model: string): boolean {
  return normalizeModelForSystemCheck(model).includes('gemma');
}
function shouldCombineSystemToUser(model: string): boolean {
  // Robust production guard:
  // some Gemma routes (Google AI Studio via OpenRouter) reject instruction channels,
  // so we inline system text into user content.
  if (isGemmaModel(model)) return true;
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutSystemSupport().some(m => normalized.includes(m.toLowerCase()));
}
function shouldRemoveJsonMode(model: string): boolean {
  // Robust production guard:
  // Gemma routes can reject OpenAI JSON mode (`response_format`).
  if (isGemmaModel(model)) return true;
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutJsonMode().some(m => normalized.includes(m.toLowerCase()));
}
function supportedRolesForModel(model: string): Set<string> {
  const supportsSystem = !shouldCombineSystemToUser(model);

  // Keep this allow-list narrow and explicit so we never send roles rejected by the selected model.
  const roles = new Set<string>(['user', 'assistant']);
  if (supportsSystem) roles.add('system');
  return roles;
}
function adaptMessagesForModel(messages: Array<{
  role: string;
  content: string;
}>, model: string): Array<{
  role: string;
  content: string;
}> {
  const combineSystemToUser = shouldCombineSystemToUser(model);
  const allowedRoles = supportedRolesForModel(model);
  const normalized = messages;

  // Step 2: If model rejects system role, fold all system instructions into a user message.
  if (combineSystemToUser) {
    const systemMessages: string[] = [];
    const passthrough: Array<{ role: string; content: string }> = [];

    for (const msg of normalized) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
        continue;
      }
      passthrough.push(msg);
    }

    if (systemMessages.length > 0) {
      const prefix = systemMessages.join('\n\n');
      const firstUserIndex = passthrough.findIndex(m => m.role === 'user');
      if (firstUserIndex >= 0) {
        passthrough[firstUserIndex] = {
          role: 'user',
          content: `${prefix}\n\n${passthrough[firstUserIndex].content}`
        };
      } else {
        passthrough.unshift({ role: 'user', content: prefix });
      }
    }

    // Step 3: Strict role filtering: only keep roles supported by this model.
    return passthrough.filter(msg => allowedRoles.has(msg.role));
  }

  // Step 3 (non-system-fallback path): strict role filtering after normalization.
  return normalized.filter(msg => allowedRoles.has(msg.role));
}
function normalizeMessagesForOutgoingPayload(messages: Array<{
  role: string;
  content: string;
}>, model: string): Array<{
  role: string;
  content: string;
}> {
  // Last-mile hardening: run model adaptation immediately before sending the HTTP request.
  // This protects against any upstream/builder drift and guarantees no unsupported roles leak out.
  const adapted = adaptMessagesForModel(messages, model);

  // Final OpenAI-compatible role allow-list for outgoing payload.
  return adapted
    .filter(msg => msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant');
}

function resolveTextModel(rawModel: string): string {
  const configured = String(rawModel ?? '').trim();
  const fallback = String(process.env.OPENROUTER_TEXT_MODEL || '').trim() || 'openai/gpt-4o-mini';
  if (!configured) return fallback;

  // Vision-first models are frequently incompatible with strict JSON/text-only generation flow.
  const looksVisionModel = /(?:^|[\/-])vl(?:[\/-]|$)/i.test(configured) || /vision/i.test(configured);
  if (!looksVisionModel) return configured;

  logger.warn('Configured OpenRouter model looks like a vision model for text generation; falling back to text model.', {
    configuredModel: configured,
    fallbackModel: fallback
  });
  return fallback;
}

function resolveJsonModel(rawModel: string): string {
  const configured = String(rawModel ?? '').trim();
  const explicitJsonModel = String(process.env.OPENROUTER_JSON_MODEL || '').trim();
  if (explicitJsonModel) {
    return resolveTextModel(explicitJsonModel);
  }

  const fallback = String(process.env.OPENROUTER_TEXT_MODEL || '').trim() || 'openai/gpt-4o-mini';
  if (!configured) return fallback;

  const looksThinkingModel = /thinking|reasoning|reasoner/i.test(configured);
  if (!looksThinkingModel) return resolveTextModel(configured);

  logger.warn('Configured OpenRouter model looks like a reasoning/thinking model for strict JSON generation. Using it because OPENROUTER_JSON_MODEL is not configured.', {
    configuredModel: configured,
    suggestion: 'Set OPENROUTER_JSON_MODEL to a JSON-stable model if available'
  });
  return configured;
}

function getConfiguredOpenRouterFallbackModels(): string[] {
  const primaryList = String(process.env.OPENROUTER_FALLBACK_MODELS || '').trim();
  const legacyAlias = String(process.env.OPENROUTER_MODEL_FALLBACKS || '').trim();
  const merged = [primaryList, legacyAlias].filter(Boolean).join(',');
  if (!merged) return [];
  return merged
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(m => resolveTextModel(m));
}

function buildModelCandidateChain(params: {
  primaryModel: string;
  mode: 'text' | 'json';
}): string[] {
  const primary = String(params.primaryModel || '').trim();
  const configuredTextModel = String(process.env.OPENROUTER_TEXT_MODEL || '').trim();
  const configuredJsonModel = String(process.env.OPENROUTER_JSON_MODEL || '').trim();
  const explicitFallbacks = getConfiguredOpenRouterFallbackModels();

  const candidates: string[] = [primary];
  if (params.mode === 'text' && configuredTextModel) {
    candidates.push(resolveTextModel(configuredTextModel));
  }
  if (params.mode === 'json') {
    if (configuredJsonModel) candidates.push(resolveTextModel(configuredJsonModel));
    if (configuredTextModel) candidates.push(resolveTextModel(configuredTextModel));
  }
  candidates.push(...explicitFallbacks);

  return normalizeAndDeduplicateModels(candidates);
}

function shouldFallbackToNextModel(error: any): boolean {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;

  // Some routed endpoints reject explicit reasoning.disable for specific models.
  // This is model-capability mismatch, so we should try next model candidate.
  if (isReasoningMandatoryError(msg)) return true;

  if (msg.includes('invalid request for model')) return false;
  if (msg.includes('invalid request')) return false;

  return (
    isRateLimitLike(msg) ||
    msg.includes('all api keys exhausted') ||
    msg.includes('request timeout') ||
    msg.includes('deadline exceeded') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('http 5') ||
    msg.includes('status: 5') ||
    /\b5\d\d\b/.test(msg)
  );
}

type OpenRouterMode = 'text' | 'json';

export interface OpenRouterRuntimeDiagnostics {
  generatedAt: string;
  env: {
    openRouterModel: string | null;
    openRouterTextModel: string | null;
    openRouterJsonModel: string | null;
    openRouterReasoningEnabled: string | null;
    fallbackModels: string[];
    fallbackModelsAlias: string[];
    effectiveFallbackModels: string[];
    hasPrimaryKey: boolean;
    backupKeysCount: number;
    logModelCandidates: boolean;
    timeoutDisabled: boolean;
  };
  modelCandidates: {
    text: string[];
    json: string[];
  };
  keyHealth: {
    trackedKeys: number;
    disabledNow: number;
    cooldownNow: number;
    lastStatusHistogram: Record<string, number>;
    lastModelHistogram: Record<string, number>;
  };
}

function readCsvEnvList(name: string): string[] {
  return String(process.env[name] || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function getOpenRouterRuntimeDiagnostics(): OpenRouterRuntimeDiagnostics {
  const openRouterModel = String(process.env.OPENROUTER_MODEL || '').trim() || null;
  const openRouterTextModel = String(process.env.OPENROUTER_TEXT_MODEL || '').trim() || null;
  const openRouterJsonModel = String(process.env.OPENROUTER_JSON_MODEL || '').trim() || null;
  const openRouterReasoningEnabled = String(process.env.OPENROUTER_REASONING_ENABLED || '').trim() || null;
  const fallbackModels = readCsvEnvList('OPENROUTER_FALLBACK_MODELS');
  const fallbackModelsAlias = readCsvEnvList('OPENROUTER_MODEL_FALLBACKS');
  const effectiveFallbackModels = getConfiguredOpenRouterFallbackModels();

  const primary = openRouterModel || 'openai/gpt-4o-mini';
  const modelCandidates = {
    text: buildModelCandidateChain({ primaryModel: primary, mode: 'text' }),
    json: buildModelCandidateChain({ primaryModel: primary, mode: 'json' })
  };

  const primaryKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  const backupKeysCount = readCsvEnvList('OPENROUTER_BACKUP_API_KEYS').length;

  const now = nowMs();
  const healthEntries = Array.from(keyHealthByKey.values());
  const statusHistogram: Record<string, number> = {};
  const modelHistogram: Record<string, number> = {};
  let disabledNow = 0;
  let cooldownNow = 0;

  for (const st of healthEntries) {
    if (st.disabledUntilMs > now) disabledNow += 1;
    if (st.cooldownUntilMs > now) cooldownNow += 1;

    const statusKey = st.lastStatus != null ? String(st.lastStatus) : 'unknown';
    statusHistogram[statusKey] = (statusHistogram[statusKey] ?? 0) + 1;

    const modelKey = String(st.lastModel || 'unknown');
    modelHistogram[modelKey] = (modelHistogram[modelKey] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    env: {
      openRouterModel,
      openRouterTextModel,
      openRouterJsonModel,
      openRouterReasoningEnabled,
      fallbackModels,
      fallbackModelsAlias,
      effectiveFallbackModels,
      hasPrimaryKey: primaryKey.length > 0,
      backupKeysCount,
      logModelCandidates: envFlag('OPENROUTER_LOG_MODEL_CANDIDATES'),
      timeoutDisabled: envFlag('OPENROUTER_DISABLE_TIMEOUT') || envFlag('OPENROUTER_DISABLE_TIMEOUTS')
    },
    modelCandidates,
    keyHealth: {
      trackedKeys: healthEntries.length,
      disabledNow,
      cooldownNow,
      lastStatusHistogram: statusHistogram,
      lastModelHistogram: modelHistogram
    }
  };
}
export class OpenRouterProvider implements LLMProvider {
  private async callOpenRouterWithModelFallback(
    requestFactory: (model: string) => OpenRouterRequest,
    options: LLMGenerateOptions,
    modelCandidates: string[],
    mode: 'text' | 'json'
  ): Promise<{ response: OpenRouterResponse; model: string }> {
    let candidates = normalizeAndDeduplicateModels(modelCandidates);

    // If an admin-specific model is configured and the caller is an admin user,
    // prefer the admin model as primary candidate.
    try {
      const adminModelRaw = String(process.env.OPENROUTER_ADMIN_MODEL || '').trim();
      if (adminModelRaw && options?.userId) {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id: options.userId }, select: ['id', 'role'] });
        if (user && user.role === 'SYSTEM_ADMIN') {
          const adminModel = resolveTextModel(adminModelRaw);
          // Prepend admin model if not already first candidate
          const rest = candidates.filter(c => c !== adminModel);
          candidates = [adminModel, ...rest];
          logger.info('Using admin-specific OpenRouter model for SYSTEM_ADMIN user', { userId: options.userId, adminModel });
        }
      }
    } catch (err: any) {
      logger.warn('Failed to resolve admin model preference; continuing with default candidates', { err: String(err?.message || err) });
    }
    if (candidates.length === 0) {
      throw new Error('AI_GENERATION_FAILED: No OpenRouter model candidates configured');
    }

    const shouldLogCandidates = envFlag('OPENROUTER_LOG_MODEL_CANDIDATES') || candidates.length > 1;
    if (shouldLogCandidates && !loggedModelCandidateModes.has(mode)) {
      loggedModelCandidateModes.add(mode);
      logger.info('OpenRouter model candidate chain', {
        mode,
        primaryModel: candidates[0],
        fallbackCount: Math.max(0, candidates.length - 1),
        candidates
      });
    }

    let lastError: any = null;
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      try {
        const response = await this.callOpenRouter(requestFactory(model), options);
        return { response, model };
      } catch (error: any) {
        lastError = error;
        const hasNext = i < candidates.length - 1;
        const canFallback = hasNext && shouldFallbackToNextModel(error);

        if (canFallback) {
          logger.warn('OpenRouter model fallback triggered', {
            traceId: options.traceId,
            userId: options.userId,
            topicId: options.topicId,
            mode,
            failedModel: model,
            nextModel: candidates[i + 1],
            reason: String(error?.message || error || 'unknown').slice(0, 400)
          });
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('AI_GENERATION_FAILED: OpenRouter call failed for all model candidates');
  }

  private async callOpenRouter(request: OpenRouterRequest, options: LLMGenerateOptions = {}): Promise<OpenRouterResponse> {
    const {
      timeout = 30000,
      maxRetries = 2,
      userId,
      topicId,
      traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      signal
    } = options;
    const requestTimeoutMs = (() => {
      const disabledByEnv = envFlag('OPENROUTER_DISABLE_TIMEOUT') || envFlag('OPENROUTER_DISABLE_TIMEOUTS');
      if (disabledByEnv) return null;
      const raw = Number(timeout);
      if (!Number.isFinite(raw) || raw <= 0) return null;
      return Math.max(1, Math.floor(raw));
    })();
    const requestedModel = request.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const model = resolveTextModel(requestedModel);
    const url = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const adaptedRequest = {
      ...request,
      messages: adaptMessagesForModel(request.messages, model)
    };
    const reasoning = resolveReasoningPreferenceForModel(model);
    if (reasoning) {
      adaptedRequest.reasoning = reasoning;
    }
    if (shouldRemoveJsonMode(model) && adaptedRequest.response_format) {
      delete adaptedRequest.response_format;
    }
    const primary = (process.env.OPENROUTER_API_KEY || '').trim();
    const backups = (process.env.OPENROUTER_BACKUP_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allKeys = normalizeAndDeduplicateKeys(primary, backups);
    if (allKeys.length === 0) {
      throw new Error('AI_GENERATION_FAILED: No OpenRouter API keys configured');
    }

    // Non-blocking hint: if a key doesn't look like OpenRouter key, warn once and still try.
    // This helps catch “User not found” issues caused by accidental wrong tokens in env.
    if (!didWarnSuspiciousKeyPrefix) {
      for (const k of allKeys) {
        if (!looksLikeOpenRouterKey(k)) {
          didWarnSuspiciousKeyPrefix = true;
          logger.warn('OpenRouter API key looks suspicious (unexpected prefix). It may be invalid or from a different provider.', {
            traceId,
            userId,
            topicId
          });
          break;
        }
      }
    }

    let lastError: Error | null = null;

    const errorsSummary: Array<{ keyIndex: number; status?: number; message: string }> = [];
    const keyDisableMs = (() => {
      const raw = String(process.env.OPENROUTER_KEY_DISABLE_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
    })();
    const defaultRateLimitCooldownMs = (() => {
      const raw = String(process.env.OPENROUTER_RATE_LIMIT_COOLDOWN_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 20_000;
    })();
    const defaultServerErrorCooldownMs = (() => {
      const raw = String(process.env.OPENROUTER_SERVER_ERROR_COOLDOWN_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 4_000;
    })();
    const defaultRetryBaseDelayMs = (() => {
      const raw = String(process.env.OPENROUTER_RETRY_BASE_DELAY_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 4_000;
    })();
    const defaultRetryMaxDelayMs = (() => {
      const raw = String(process.env.OPENROUTER_RETRY_MAX_DELAY_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 30_000;
    })();
    const getRetryDelayMs = (attempt: number): number => {
      const exp = defaultRetryBaseDelayMs * Math.pow(2, attempt);
      return Math.min(exp, defaultRetryMaxDelayMs);
    };

    for (let keyIdx = 0; keyIdx < allKeys.length; keyIdx++) {
      const apiKey = allKeys[keyIdx];
      const keyIndex = keyIdx + 1;
      const keyHealth = getKeyHealth(apiKey);
      const now = nowMs();
      if (keyHealth.disabledUntilMs > now) {
        logger.info('OpenRouter key skipped (disabled)', {
          traceId,
          userId,
          topicId,
          keyIndex,
          keysAvailable: allKeys.length,
          disabledForMs: keyHealth.disabledUntilMs - now,
          model
        });
        continue;
      }
      const rateLimitCooldown =
        keyHealth.cooldownUntilMs > now &&
        keyHealth.lastStatus === 429 &&
        isRateLimitLike(keyHealth.lastErrorMessage || '');
      const canBypassCooldownForDifferentModel =
        rateLimitCooldown &&
        !!keyHealth.lastModel &&
        keyHealth.lastModel !== model;

      if (keyHealth.cooldownUntilMs > now && !canBypassCooldownForDifferentModel) {
        logger.info('OpenRouter key skipped (cooldown)', {
          traceId,
          userId,
          topicId,
          keyIndex,
          keysAvailable: allKeys.length,
          cooldownForMs: keyHealth.cooldownUntilMs - now,
          model
        });
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          if (requestTimeoutMs !== null) {
            timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
          }
          if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', onAbort, { once: true });
          }
          const logContext = {
            traceId,
            userId,
            topicId,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            keyIndex,
            keysAvailable: allKeys.length,
            model,
            timeoutMs: requestTimeoutMs
          };
          logger.info("OpenRouter request started", logContext);
          const finalMessages = normalizeMessagesForOutgoingPayload(adaptedRequest.messages, model);
          const outgoingRoles = finalMessages.map(m => m.role);
          const hasUnknownRole = outgoingRoles.some(r => r !== 'system' && r !== 'user' && r !== 'assistant' && r !== 'tool');
          const hasSystemRole = outgoingRoles.includes('system');
          if (hasUnknownRole) {
            logger.warn(`Outgoing AI request roles include unknown values: ${JSON.stringify(outgoingRoles)}`, {
              traceId,
              userId,
              topicId,
              model,
              roles: outgoingRoles
            });
          } else if (!hasSystemRole) {
            // Some flows intentionally send only user role; keep this as debug to avoid noisy false alarms.
            logger.debug(`Outgoing AI request roles: ${JSON.stringify(outgoingRoles)}`, {
              traceId,
              userId,
              topicId,
              model,
              roles: outgoingRoles
            });
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://studycod.app',
              'X-Title': 'StudyCod Task Generator'
            },
            body: JSON.stringify({
              ...adaptedRequest,
              messages: finalMessages,
              model
            }),
            signal: controller.signal
          });
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (signal) signal.removeEventListener('abort', onAbort);
          if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
            logger.warn("OpenRouter request failed", {
              ...logContext,
              status: response.status,
              error: errorText
            });

            keyHealth.consecutiveFailures += 1;
            keyHealth.lastStatus = response.status;
            keyHealth.lastErrorMessage = String(errorText ?? '');
            keyHealth.lastModel = model;

            errorsSummary.push({
              keyIndex,
              status: response.status,
              message: String(errorText ?? '').slice(0, 400)
            });

            let parsedError: any = null;
            try {
              parsedError = JSON.parse(errorText);
            } catch {
              parsedError = null;
            }
            const errorMessage = parsedError?.error?.message || errorText;
            const isInvalidArgument = response.status === 400 && (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled'));
            const isRateLimit = response.status === 429 || isRateLimitLike(errorMessage);
            if (isInvalidArgument) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
            }
            if (response.status === 400) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
            }
            if (response.status === 401 || response.status === 403) {
              // Invalid/unauthorized key – disable it for a while so we stop burning it on every request.
              keyHealth.disabledUntilMs = nowMs() + keyDisableMs;
              lastError = error;
              break;
            }
            if (isRateLimit || response.status >= 500) {
              const retryAfterMs = parseRetryAfterMs(response);
              if (isRateLimit) {
                // Cool down this key; try other keys for this request.
                keyHealth.cooldownUntilMs = nowMs() + (retryAfterMs > 0 ? retryAfterMs : defaultRateLimitCooldownMs);
              } else {
                keyHealth.cooldownUntilMs = nowMs() + defaultServerErrorCooldownMs;
              }
              if (attempt < maxRetries) {
                lastError = error;
                const delay = getRetryDelayMs(attempt);
                logger.info("OpenRouter retry", {
                  traceId,
                  userId,
                  topicId,
                  attempt: attempt + 1,
                  status: response.status,
                  delay
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              lastError = error;
              // Rate limited on this key: move on to the next configured key.
              if (isRateLimit) break;
            }
            throw error;
          }
          const data = (await response.json()) as OpenRouterResponse;
          if (data.error) {
            const errorMessage = data.error.message || data.error.type || 'Unknown error';
            const isInvalidArgument = errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled');
            const isRateLimit = isRateLimitLike(errorMessage);
            const error = new Error(`OpenRouter API error: ${errorMessage}`);
            logger.warn("OpenRouter API error", {
              ...logContext,
              error: data.error
            });

            keyHealth.consecutiveFailures += 1;
            keyHealth.lastStatus = isRateLimit ? 429 : (keyHealth.lastStatus ?? 500);
            keyHealth.lastErrorMessage = errorMessage;
            keyHealth.lastModel = model;
            errorsSummary.push({
              keyIndex,
              status: keyHealth.lastStatus,
              message: String(errorMessage ?? '').slice(0, 400)
            });

            if (isInvalidArgument) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorMessage}`);
            }
            if (isRateLimit) {
              keyHealth.cooldownUntilMs = nowMs() + defaultRateLimitCooldownMs;
              if (attempt < maxRetries) {
                lastError = error;
                const delay = getRetryDelayMs(attempt);
                logger.info("OpenRouter retry (rate limit)", {
                  traceId,
                  userId,
                  topicId,
                  attempt: attempt + 1,
                  delay
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              // Rate limited on this key: move on to the next configured key.
              lastError = error;
              break;
            }
            if (attempt < maxRetries) {
              lastError = error;
              continue;
            }
            throw error;
          }
          const responseId = data.id || 'unknown';

          // Success: reset health counters.
          keyHealth.consecutiveFailures = 0;
          keyHealth.lastStatus = 200;
          keyHealth.lastErrorMessage = undefined;
          keyHealth.cooldownUntilMs = 0;
          keyHealth.lastModel = model;

          logger.info("OpenRouter request succeeded", {
            ...logContext,
            responseId
          });
          return data;
        } catch (err: any) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          if (signal && err?.name === 'AbortError' && signal.aborted) {
            // External cancellation (request deadline) – surface as timeout to callers.
            throw new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)');
          }
          lastError = err;
          if (requestTimeoutMs !== null && (err.name === 'AbortError' || err.message?.includes('timeout'))) {
            logger.warn("OpenRouter request timeout", {
              traceId,
              userId,
              topicId,
              attempt: attempt + 1
            });
            const timeoutSeconds = Math.max(1, Math.round(requestTimeoutMs / 1000));
            throw new Error(`AI_GENERATION_FAILED: Request timeout (${timeoutSeconds}s exceeded)`);
          }
          if (err.message?.includes('Invalid request for model')) {
            throw err;
          }
          if (isRateLimitLike(err?.message || '')) {
            // Try the next key (if any) instead of failing fast.
            lastError = err;
            break;
          }
          if (err.message?.includes('AI_GENERATION_FAILED')) {
            throw err;
          }
          if (attempt >= maxRetries) {
            break;
          }
          const delay = getRetryDelayMs(attempt);
          logger.info("OpenRouter retry", {
            traceId,
            userId,
            topicId,
            attempt: attempt + 1,
            delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    if (lastError?.message?.includes('Invalid request for model')) {
      throw lastError;
    }
    if (lastError?.message?.includes('Rate limit exceeded')) {
      throw lastError;
    }

    if (errorsSummary.length > 0) {
      const countsByStatus = new Map<number, number>();
      for (const e of errorsSummary) {
        const st = typeof e.status === 'number' ? e.status : 0;
        countsByStatus.set(st, (countsByStatus.get(st) ?? 0) + 1);
      }
      const statusSummary = Array.from(countsByStatus.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([st, cnt]) => `${st || 'unknown'}x${cnt}`)
        .join(', ');

      throw new Error(
        `AI_GENERATION_FAILED: All API keys exhausted for model ${model}. ` +
        `Errors: ${statusSummary}. ` +
        `Last error: ${lastError?.message || 'Unknown error'}`
      );
    }

    throw new Error(`AI_GENERATION_FAILED: All API keys exhausted for model ${model}. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  async generateText(prompt: string, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<string> {
    const primaryModel = resolveTextModel(process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini');
    const modelCandidates = buildModelCandidateChain({
      primaryModel,
      mode: 'text'
    });
    const messages: Array<{
      role: string;
      content: string;
    }> = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    messages.push({
      role: 'user',
      content: prompt
    });
    const {
      response,
      model
    } = await this.callOpenRouterWithModelFallback((candidateModel: string) => ({
      model: candidateModel,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    }), options, modelCandidates, 'text');
    const content = extractOpenRouterText(response).trim();
    if (!content) {
      logger.warn('OpenRouter response had no extractable text', {
        model,
        responseId: response.id || 'unknown',
        shape: summarizeOpenRouterResponseShape(response)
      });
      throw new Error('AI_GENERATION_FAILED: Empty response from LLM');
    }
    return content;
  }
  async generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<T> {
    const primaryModel = resolveJsonModel(process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini');
    const modelCandidates = buildModelCandidateChain({
      primaryModel,
      mode: 'json'
    });
    const messages: Array<{
      role: string;
      content: string;
    }> = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    const jsonPrompt = `${prompt}\n\nСхема JSON:\n${JSON.stringify(schema, null, 2)}\n\nВідповідай ТІЛЬКИ валідним JSON без markdown блоків.`;
    messages.push({
      role: 'user',
      content: jsonPrompt
    });
    const {
      response,
      model
    } = await this.callOpenRouterWithModelFallback((candidateModel: string) => ({
      model: candidateModel,
      messages,
      response_format: {
        type: 'json_object'
      },
      temperature: options.temperature,
      max_tokens: options.maxTokens
    }), options, modelCandidates, 'json');
    const content = extractOpenRouterText(response).trim();
    if (!content) {
      logger.warn('OpenRouter JSON response had no extractable text', {
        model,
        responseId: response.id || 'unknown',
        shape: summarizeOpenRouterResponseShape(response)
      });
      throw new Error('AI_GENERATION_FAILED: Empty response from LLM');
    }

    const jsonOnlySystemPrompt = 'You are a strict JSON formatter. Return ONLY one valid JSON object. Never output analysis, reasoning, or any prose.';
    const jsonRepairPrompt = [
      'Convert the following model output into a VALID JSON object that conforms to the schema.',
      'Rules:',
      '- Output ONLY JSON object',
      '- No markdown fences',
      '- No explanations or prefixes like "Okay"',
      '- First character MUST be "{" and last character MUST be "}"',
      '- Do NOT output any analysis / internal thoughts',
      '- Do NOT output text like "Okay, let\'s"',
      '- Keep semantics, only fix formatting/structure',
      '',
      'Schema:',
      JSON.stringify(schema, null, 2),
      '',
      'Original output:',
      content
    ].join('\n');

    const strictRegeneratePrompt = [
      prompt,
      '',
      'JSON schema:',
      JSON.stringify(schema, null, 2),
      '',
      'CRITICAL OUTPUT CONTRACT:',
      '- Return one JSON object only',
      '- No text before JSON',
      '- No text after JSON',
      '- No markdown/code fences',
      '- Response must start with "{" and end with "}"',
      '- No analysis, no reasoning, no comments',
      '- Never write: "Okay, let\'s..."',
      '',
      'Valid shape example (illustrative only):',
      '{"title":"...","topic":"...","difficulty":1,"theoryMarkdown":"...","practicalTask":"...","inputFormat":"...","outputFormat":"...","constraints":"...","examples":[{"input":"...","output":"...","explanation":"..."}],"codeTemplate":"..."}'
    ].join('\n');

    try {
      let jsonContent = content;
      if (jsonContent.includes('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) jsonContent = jsonMatch[1];
      }
      return parseModelJsonOrThrow<T>(jsonContent);
    } catch (error: any) {
      const primaryParseError = error?.message || String(error);
      let repairParseError: string | null = null;

      logger.debug('OpenRouter JSON parse failed on primary response; attempting repair', {
        model,
        responseId: response.id || 'unknown',
        parseError: primaryParseError,
        preview: content.slice(0, 160)
      });

      try {
        const repairCandidates = normalizeAndDeduplicateModels([model, ...modelCandidates]);
        const {
          response: repaired,
          model: repairModel
        } = await this.callOpenRouterWithModelFallback((candidateModel: string) => ({
          model: candidateModel,
          messages: [
            {
              role: 'system',
              content: jsonOnlySystemPrompt
            },
            {
              role: 'user',
              content: jsonRepairPrompt
            }
          ],
          response_format: {
            type: 'json_object'
          },
          temperature: 0,
          max_tokens: options.maxTokens
        }), {
          ...options,
          maxRetries: 0,
          temperature: 0
        }, repairCandidates, 'json');
        const repairedContent = extractOpenRouterText(repaired).trim();
        if (!repairedContent) {
          throw new Error('Empty repair response content');
        }
        try {
          return parseModelJsonOrThrow<T>(repairedContent);
        } catch (repairErr: any) {
          repairParseError = repairErr?.message || String(repairErr);

          logger.debug('OpenRouter JSON parse failed on repair response; trying strict regeneration', {
            model,
            responseId: repaired.id || 'unknown',
            parseError: repairParseError,
            preview: repairedContent.slice(0, 160)
          });

          const strictCandidates = normalizeAndDeduplicateModels([repairModel, ...repairCandidates]);
          const {
            response: strictResponse
          } = await this.callOpenRouterWithModelFallback((candidateModel: string) => ({
            model: candidateModel,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              {
                role: 'user',
                content: strictRegeneratePrompt
              }
            ],
            response_format: {
              type: 'json_object'
            },
            temperature: 0,
            max_tokens: options.maxTokens
          }), {
            ...options,
            maxRetries: 0,
            temperature: 0
          }, strictCandidates, 'json');
          const strictContent = extractOpenRouterText(strictResponse).trim();
          if (!strictContent) {
            throw new Error('Empty strict regeneration response content');
          }
          return parseModelJsonOrThrow<T>(strictContent);
        }
      } catch (fixError: any) {
        logger.warn('OpenRouter JSON recovery failed after parse error', {
          model,
          responseId: response.id || 'unknown',
          primaryParseError,
          repairParseError,
          recoveryError: fixError?.message || String(fixError),
          preview: content.slice(0, 160)
        });
        throw new Error(`AI_GENERATION_FAILED: Failed to parse JSON response: ${error.message}. ` + `Fix attempt failed: ${fixError?.message || String(fixError)}`);
      }
    }
  }
}