export interface Env {
  AI: {
    run: (model: string, options: any) => Promise<any>;
  };
  ENVIRONMENT?: string;
}
type Language = "uk" | "en";
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
    "generate-task": "Створи повну умову задачі з програмування.",
    "generate-task-condition": "Згенеруй ТІЛЬКИ умову задачі.",
    "generate-task-template": "Згенеруй ТІЛЬКИ шаблон коду.",
    "generate-theory": "Поясни тему структуровано з прикладами.",
    "generate-quiz": "Згенеруй тестові запитання з відповідями.",
    "generate-test-data": "Згенеруй СТРОГИЙ JSON з тестовими даними.",
    "generate-json": "Згенеруй СТРОГИЙ JSON.",
    "generate-text": "Ти — корисний навчальний помічник."
  };
  return `
${languageRule}
${modeRule[mode] ?? modeRule["generate-text"]}

ЗАБОРОНЕНО:
- змінювати мову
- додавати пояснення у JSON
`;
}
function extractText(result: any): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  if (typeof result.text === "string") return result.text;
  if (typeof result.output_text === "string") return result.output_text;
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
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
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
      const systemPrompt = buildSystemPrompt(mode, language) + (body.params.systemPrompt ? "\n\nДодаткові умови:\n" + body.params.systemPrompt : "");
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