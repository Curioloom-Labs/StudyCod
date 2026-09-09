export interface AIServiceConfig {
  port: number;
  isProduction: boolean;
  corsOrigins: string[];
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function readPort(): number {
  const port = Number.parseInt(readEnv("AI_SERVICE_PORT"), 10);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : 3001;
}

export function readAIServiceConfig(): AIServiceConfig {
  const isProduction = readEnv("NODE_ENV") === "production";
  const configuredOrigins = readEnv("CORS_ORIGIN");
  const corsOrigins = (configuredOrigins || (isProduction ? "" : "http://localhost:5173"))
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  return {
    port: readPort(),
    isProduction,
    corsOrigins
  };
}
