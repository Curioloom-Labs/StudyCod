export interface Env {
  AI: {
    run: (model: string, options: any) => Promise<any>;
  };
  ENVIRONMENT?: string;
  /**
   * Shared secret required in the `x-internal-secret` request header.
   * Configure via `wrangler secret put WORKER_SHARED_SECRET`. Without it the
   * worker is an open proxy to paid Workers AI inference (cost-amplification
   * DoS), so in production an unset secret fails closed.
   */
  WORKER_SHARED_SECRET?: string;
  /** Optional exact Origin to echo for browser callers. Server-to-server callers do not need CORS. */
  CORS_ALLOW_ORIGIN?: string;
}

/**
 * Constant-time-ish string compare to avoid trivial timing oracles on the
 * shared secret. Lengths differing short-circuits, which is acceptable here.
 */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns a Response when the request must be rejected, or null when authorized.
 */
function checkAuth(req: Request, env: Env, cors: Record<string, string>): Response | null {
  const expected = String(env.WORKER_SHARED_SECRET ?? "").trim();
  const isProduction = String(env.ENVIRONMENT ?? "").toLowerCase() === "production";

  if (!expected) {
    // No secret configured: refuse to run in production rather than serve an
    // open, unauthenticated proxy to paid inference.
    if (isProduction) {
      return new Response(JSON.stringify({ error: "Worker secret not configured" }), {
        status: 503,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    return null; // dev convenience only
  }

  const provided = String(req.headers.get("x-internal-secret") ?? "");
  if (!secretsMatch(provided, expected)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
  return null;
}
type Language = "uk" | "en";

type LibreTranslateRequest = {
  q: string;
  source?: string;
  target?: string;
  format?: string;
};
interface WorkerRequest {
  mode: string;
  language?: Language;
  params: {
    prompt: string;
    systemPrompt?: string;
    schema?: object;
    temperature?: number;
    maxTokens?: number;
  };
}
function normalizeMode(mode?: string): string {
  if (!mode) return "generate-text";
  const m = mode.toLowerCase().trim().replace(/[_\s]+/g, "-");
  const map: Record<string, string> = {
    "generate-task": "generate-task",
    "generate-task-condition": "generate-task-condition",
    "generate-task-template": "generate-task-template",
    "generate-theory": "generate-theory",
    "generate-quiz": "generate-quiz",
    "generate-test-data": "generate-test-data",
    "generate-json": "generate-json",
    "generate-text": "generate-text",
    "generatetask": "generate-task",
    "generatetaskcondition": "generate-task-condition",
    "generatetestdata": "generate-test-data"
  };
  return map[m] ?? "generate-text";
}
function isJSONMode(mode: string, schema?: object): boolean {
  return mode === "generate-json" || mode === "generate-test-data" || !!schema;
}
function resolveMaxTokens(mode: string, requested?: number): number {
  if (requested && requested > 0) return Math.min(requested, 4096);
  const map: Record<string, number> = {
    "generate-task": 3500,
    "generate-task-condition": 1500,
    "generate-task-template": 1200,
    "generate-theory": 4000,
    "generate-quiz": 2500,
    "generate-test-data": 2000,
    "generate-json": 2000,
    "generate-text": 2000
  };
  return map[mode] ?? 2000;
}
function buildSystemPrompt(mode: string, lang: Language): string {
  const languageRule = lang === "en" ? "Respond ONLY in English." : "Відповідай ВИКЛЮЧНО українською мовою.";
  const modeRule: Record<string, string> = {
    "generate-task": lang === "en"
      ? "Create a full judgeable programming task in JSON. The task must be solvable by ONE COMPLETE PROGRAM FILE (main function/entry point) using stdin/stdout OR no input with fixed output. ABSOLUTELY FORBIDDEN: ask to implement a standalone function/method/class; ask to write just a function body; ask to create files/folders/projects; ask to configure IDE/compiler/build tools; ask for unit tests or test functions. The ONLY acceptable solution format is a complete, runnable program that reads input and produces deterministic output."
      : "Створи повну перевірювану задачу з програмування у форматі JSON. Завдання має бути розв'язаним ОДНИМ ПОВНИМ ФАЙЛОМ ПРОГРАМИ (main функція/точка входу) через stdin/stdout АБО без вводу з фіксованим виводом. АБСОЛЮТНО ЗАБОРОНЕНО: просити реалізувати окремо функцію/метод/клас; просити писати лише тіло функції; просити створювати файли/папки/проєкти; просити налаштовувати IDE/компілятор/інструменти збірки; просити unit-тести. ЄДИНИЙ прийнятний формат розв'язку — повна, запустима програма, яка читає вхідні дані і виробляє детермінований вивід.",
    "generate-task-condition": lang === "en"
      ? "Generate only a single judgeable programming task statement. Do not include examples, markdown metadata, or extra commentary."
      : "Згенеруй лише одну перевірювану умову задачі. Не додавай прикладів, markdown-метаданих або зайвих пояснень.",
    "generate-task-template": lang === "en"
      ? "Generate only the code template for the task, with TODO comments and no implementation."
      : "Згенеруй лише шаблон коду для задачі, з коментарями TODO і без реалізації.",
    "generate-theory": lang === "en"
      ? "Explain the topic in a structured way with examples."
      : "Поясни тему структуровано з прикладами.",
    "generate-quiz": lang === "en"
      ? "Generate quiz questions with answers."
      : "Згенеруй тестові запитання з відповідями.",
    "generate-test-data": lang === "en"
      ? "Generate strict JSON with test data."
      : "Згенеруй СТРОГИЙ JSON з тестовими даними.",
    "generate-json": lang === "en"
      ? "Generate strict JSON."
      : "Згенеруй СТРОГИЙ JSON.",
    "generate-text": lang === "en"
      ? "You are a helpful learning assistant."
      : "Ти — корисний навчальний помічник."
  };
  return `
${languageRule}
${modeRule[mode] ?? modeRule["generate-text"]}

ЗАБОРОНЕНО:
- змінювати мову
- додавати пояснення у JSON
`;
}
// The backend ships the no-stdin curriculum policy inside params.allowedIoTypes,
// but the model never sees an instruction explaining it. Without this directive
// the model defaults to stdin tasks for "no input" stages (e.g. hello-world),
// which the backend then rejects with `ioType "STDIN_STDOUT" is not allowed for
// this stage` — failing every attempt. We translate the allowlist into an
// explicit, forceful instruction appended to the system prompt.
function buildIoTypeDirective(promptRaw: string, lang: Language): string {
  let allowed: string[] | null = null;
  try {
    const parsed = JSON.parse(String(promptRaw ?? ""));
    if (parsed && Array.isArray(parsed.allowedIoTypes)) {
      allowed = parsed.allowedIoTypes
        .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
        .filter((s: string) => s === "STDIN_STDOUT" || s === "NO_INPUT_FIXED_OUTPUT" || s === "NO_INPUT_FREE_OUTPUT");
    }
  } catch {
    return "";
  }
  if (!allowed || allowed.length === 0) return "";

  const stdinAllowed = allowed.includes("STDIN_STDOUT");
  const onlyStdin = allowed.length === 1 && stdinAllowed;

  if (!stdinAllowed) {
    // No-input stage: forbid reading input entirely.
    return lang === "en"
      ? `\n\nIO POLICY (MANDATORY): For THIS task input is FORBIDDEN. Set "ioType" to "${allowed[0]}". The program must NOT read anything from stdin — do NOT use input(), Scanner, BufferedReader, System.in, cin, std::cin, getline. "inputFormat" must state there is no input. "examples[0].input" must be an empty string "". The program prints a constant or a value it computes by itself (deterministic stdout).`
      : `\n\nIO-ПОЛІТИКА (ОБОВ'ЯЗКОВО): Для ЦЬОГО завдання ввід ЗАБОРОНЕНО. Постав "ioType" = "${allowed[0]}". Програма НЕ повинна нічого читати зі stdin — НЕ використовуй input(), Scanner, BufferedReader, System.in, cin, std::cin, getline. "inputFormat" має вказувати, що вводу немає. "examples[0].input" має бути порожнім рядком "". Програма виводить константу або значення, яке сама обчислює (детермінований stdout).`;
  }
  if (onlyStdin) {
    return lang === "en"
      ? `\n\nIO POLICY (MANDATORY): For THIS task set "ioType" to "STDIN_STDOUT". The program MUST read its data from stdin, and "examples[0].input" MUST be non-empty.`
      : `\n\nIO-ПОЛІТИКА (ОБОВ'ЯЗКОВО): Для ЦЬОГО завдання постав "ioType" = "STDIN_STDOUT". Програма МАЄ читати дані зі stdin, а "examples[0].input" МАЄ бути непорожнім.`;
  }
  // Mixed allowlist — just constrain the set.
  return lang === "en"
    ? `\n\nIO POLICY (MANDATORY): "ioType" MUST be one of: ${allowed.join(", ")}. Do not use any other IO type.`
    : `\n\nIO-ПОЛІТИКА (ОБОВ'ЯЗКОВО): "ioType" МАЄ бути одним із: ${allowed.join(", ")}. Не використовуй інший IO-тип.`;
}
function extractText(result: any): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  if (typeof result.text === "string") return result.text;
  if (typeof result.output_text === "string") return result.output_text;
  // OpenAI/most providers shape: { choices: [{ message: { content: "..." } }] }
  // and the streaming-style { choices: [{ delta: { content: "..." } }] }.
  // Workers AI sometimes mimics OpenAI when wrapped. Missing this used to
  // return "" and force a fallback to OpenRouter, leaking cost on every miss.
  if (Array.isArray(result.choices)) {
    for (const choice of result.choices) {
      const messageContent = choice?.message?.content;
      if (typeof messageContent === "string" && messageContent.length > 0) {
        return messageContent;
      }
      const deltaContent = choice?.delta?.content;
      if (typeof deltaContent === "string" && deltaContent.length > 0) {
        return deltaContent;
      }
      if (typeof choice?.text === "string" && choice.text.length > 0) {
        return choice.text;
      }
    }
  }
  if (Array.isArray(result.outputs)) {
    for (const out of result.outputs) {
      if (Array.isArray(out?.content)) {
        for (const c of out.content) {
          if (typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return "";
}
function extractJSON(result: any): any {
  if (!result || typeof result !== "object") return null;
  if (Array.isArray(result.outputs)) {
    for (const out of result.outputs) {
      if (Array.isArray(out?.content)) {
        for (const c of out.content) {
          if (c?.type === "json" && c?.data) {
            return c.data;
          }
        }
      }
    }
  }
  return null;
}
async function callWorkersAI(env: Env, messages: {
  role: string;
  content: string;
}[], temperature: number, maxTokens: number, jsonMode: boolean): Promise<string | object> {
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? {
      response_format: {
        type: "json_object"
      }
    } : {})
  });
  if (jsonMode) {
    const json = extractJSON(result);
    if (!json) throw new Error("Empty JSON response from Workers AI");
    return json;
  }
  const text = extractText(result);
  if (!text || !text.trim()) {
    throw new Error("Empty text response from Workers AI");
  }
  return text;
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // This worker is called server-to-server by the backend. We do NOT emit a
    // wildcard ACAO; an origin is echoed only if explicitly allow-listed for a
    // browser caller. The secret header is allowed for completeness.
    const allowOrigin = String(env.CORS_ALLOW_ORIGIN ?? "").trim();
    const cors: Record<string, string> = {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-internal-secret",
      "Vary": "Origin"
    };
    if (allowOrigin) cors["Access-Control-Allow-Origin"] = allowOrigin;

    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        error: "Method not allowed"
      }), {
        status: 405,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }

    // Authenticate before doing any (paid) work or parsing the body.
    const authFailure = checkAuth(req, env, cors);
    if (authFailure) return authFailure;

    // LibreTranslate-compatible endpoint: POST /translate
    // Input: { q: string, source?: string, target?: string }
    // Output: { translatedText: string }
    if (url.pathname === "/translate") {
      try {
        const body = (await req.json()) as LibreTranslateRequest;
        const q = String(body?.q ?? "");
        const source = String(body?.source ?? "uk").trim().toLowerCase() || "uk";
        const target = String(body?.target ?? "en").trim().toLowerCase() || "en";
        if (!q.trim()) {
          return new Response(JSON.stringify({ error: "q is required" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }
        if (!env?.AI?.run) {
          return new Response(JSON.stringify({ error: "Workers AI binding is missing" }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }

        const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
          text: q,
          source_lang: source,
          target_lang: target,
        });
        const translatedText = String((result as any)?.translated_text ?? "");
        if (!translatedText) {
          return new Response(JSON.stringify({ error: "Empty translation" }), {
            status: 502,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ translatedText }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    try {
      const body = (await req.json()) as WorkerRequest;
      if (!body?.params?.prompt) {
        return new Response(JSON.stringify({
          error: "params.prompt is required"
        }), {
          status: 400,
          headers: {
            ...cors,
            "Content-Type": "application/json"
          }
        });
      }
      const mode = normalizeMode(body.mode);
      const jsonMode = isJSONMode(mode, body.params.schema);
      const language: Language = body.language === "en" ? "en" : "uk";
      const ioDirective = mode === "generate-task" ? buildIoTypeDirective(body.params.prompt, language) : "";
      const systemPrompt = buildSystemPrompt(mode, language) + ioDirective + (body.params.systemPrompt ? "\n\nДодаткові умови:\n" + body.params.systemPrompt : "");
      const messages = [{
        role: "system",
        content: systemPrompt
      }, {
        role: "user",
        content: body.params.prompt
      }];
      const result = await callWorkersAI(env, messages, body.params.temperature ?? 0.7, resolveMaxTokens(mode, body.params.maxTokens), jsonMode);
      return new Response(JSON.stringify({
        content: result
      }), {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({
        error: err.message ?? "Internal error"
      }), {
        status: 500,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }
  }
};