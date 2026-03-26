import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { logger } from '../../utils/logger';
import { tryFixJsonResponse } from '../../../../shared/utils/taskValidator';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type OpenAICompatRequest = {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	max_tokens?: number;
};

type OpenAICompatResponse = {
	id?: string;
	choices?: Array<{
		message?: { content?: string };
	}>;
	error?: { message?: string; type?: string };
};

function nowMs(): number {
	return Date.now();
}

function parseEnvTimeoutMs(envVar: string, fallbackMs: number, minMs: number, maxMs: number): number {
	const raw = String(process.env[envVar] ?? '').trim();
	const n = raw ? Number(raw) : NaN;
	const v = Number.isFinite(n) ? Math.floor(n) : fallbackMs;
	return Math.max(minMs, Math.min(maxMs, v));
}

function resolveLocalChatCompletionsUrl(): string {
	const base = String(process.env.LOCAL_LLM_URL || '').trim();
	if (!base) return '';
	// Accept either a full chat/completions URL or a server base URL.
	if (/\/chat\/completions\b/i.test(base)) return base;
	if (/\/v1\b/i.test(base)) return base.replace(/\/+$/, '') + '/chat/completions';
	return base.replace(/\/+$/, '') + '/v1/chat/completions';
}

export class LocalLLMProvider implements LLMProvider {
	private async callLocal(request: OpenAICompatRequest, options: LLMGenerateOptions = {}): Promise<OpenAICompatResponse> {
		const url = resolveLocalChatCompletionsUrl();
		if (!url) throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');

		const timeout = typeof options.timeout === 'number' && Number.isFinite(options.timeout)
			? Math.max(500, Math.floor(options.timeout))
			: parseEnvTimeoutMs('LOCAL_LLM_TIMEOUT_MS', 45_000, 1_000, 240_000);

		const traceId = options.traceId || `local-${nowMs()}-${Math.random().toString(36).slice(2, 9)}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);
		const onAbort = () => controller.abort();
		if (options.signal) {
			if (options.signal.aborted) controller.abort();
			else options.signal.addEventListener('abort', onAbort, { once: true });
		}

		const apiKey = String(process.env.LOCAL_LLM_API_KEY || '').trim();

		try {
			logger.info('[llm] local request started', {
				traceId,
				userId: options.userId,
				topicId: options.topicId,
				timeout
			});

			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
				},
				body: JSON.stringify(request),
				signal: controller.signal
			});

			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(`AI_GENERATION_FAILED: Local LLM HTTP ${resp.status}: ${text}`);
			}

			return (await resp.json()) as OpenAICompatResponse;
		} catch (err: any) {
			if (options.signal && err?.name === 'AbortError' && options.signal.aborted) {
				throw new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)');
			}
			if (err?.name === 'AbortError') {
				const timeoutSeconds = Math.max(1, Math.round(timeout / 1000));
				throw new Error(`AI_GENERATION_FAILED: Request timeout (${timeoutSeconds}s exceeded)`);
			}
			if (err?.message?.includes('AI_GENERATION_FAILED')) throw err;
			throw new Error(`AI_GENERATION_FAILED: ${err?.message || String(err)}`);
		} finally {
			clearTimeout(timeoutId);
			if (options.signal) options.signal.removeEventListener('abort', onAbort);
		}
	}

	async generateText(prompt: string, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<string> {
		const model = String(process.env.LOCAL_LLM_MODEL || process.env.OPENROUTER_MODEL || 'gpt-4o-mini').trim();
		const messages: ChatMessage[] = [];
		if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
		messages.push({ role: 'user', content: prompt });

		const response = await this.callLocal({
			model,
			messages,
			temperature: options.temperature,
			max_tokens: options.maxTokens
		}, options);

		const content = response.choices?.[0]?.message?.content;
		if (!content) throw new Error('AI_GENERATION_FAILED: Empty response from local LLM');
		return String(content);
	}

	async generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<T> {
		const jsonPrompt = `${prompt}\n\nJSON schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY valid JSON (no markdown, no explanations).`;
		const content = await this.generateText(jsonPrompt, systemPrompt, options);
		try {
			let jsonContent = content.trim();
			if (jsonContent.includes('```')) {
				const jsonMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
				if (jsonMatch) jsonContent = jsonMatch[1];
			}
			return JSON.parse(jsonContent) as T;
		} catch (error: any) {
			try {
				return tryFixJsonResponse(content) as T;
			} catch (fixError: any) {
				throw new Error(
					`AI_GENERATION_FAILED: Failed to parse JSON response: ${error.message}. ` +
					`Fix attempt failed: ${fixError?.message || String(fixError)}`
				);
			}
		}
	}
}
