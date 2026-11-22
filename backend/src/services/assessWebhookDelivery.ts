import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { lookup as dnsLookup } from "dns/promises";
import { isIP } from "net";
import { request as httpsRequest } from "https";
import { AppDataSource } from "../data-source";
import { JWT_SECRET } from "../config";
import { logger } from "../utils/logger";

export const assessWebhookEvents = [
  "assessment.invited",
  "assessment.claimed",
  "assessment.accepted",
  "assessment.declined",
  "assessment.evidence_selected",
  "assessment.answers_submitted",
  "assessment.task_assigned",
  "assessment.task_submitted",
  "assessment.review_saved",
  "assessment.followup_requested",
  "assessment.followup_answered",
  "assessment.decision_saved",
  "assessment.withdrawn",
] as const;
export type AssessWebhookEvent = typeof assessWebhookEvents[number];

const encryptionKey = () => createHash("sha256").update(JWT_SECRET).digest();

export function encryptAssessWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

function decryptAssessWebhookSecret(value: string): string {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("INVALID_WEBHOOK_SECRET_CIPHERTEXT");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    if ([0, 10, 127].includes(a) || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 255) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      return isIP(mapped) === 4 && isPublicAddress(mapped);
    }
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff && !normalized.startsWith("2001:db8:");
  }
  return false;
}

export async function validateAssessWebhookUrl(value: string): Promise<URL | null> {
  let target: URL;
  try { target = new URL(value); } catch { return null; }
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (target.protocol !== "https:" || target.username || target.password || !hostname
    || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return null;
  try {
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await dnsLookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return null;
  } catch { return null; }
  return target;
}

export async function enqueueAssessWebhookEvent(input: {
  companyId: string;
  type: AssessWebhookEvent;
  assessmentId: string;
  status: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const eventId = randomUUID();
  const payload = JSON.stringify({
    id: eventId,
    type: input.type,
    createdAt: new Date().toISOString(),
    data: { ...(input.data ?? {}), companyId: input.companyId, assessmentId: input.assessmentId, status: input.status },
  });
  const subscriptions = await AppDataSource.query(
    "SELECT id,events_json AS eventsJson FROM growth_assess_webhooks WHERE company_id=? AND enabled=1",
    [input.companyId],
  ) as Array<{ id: string; eventsJson: string }>;
  for (const subscription of subscriptions) {
    let events: unknown = [];
    try { events = JSON.parse(subscription.eventsJson); } catch { /* malformed subscription remains inactive */ }
    if (!Array.isArray(events) || (!events.includes(input.type) && !events.includes("*"))) continue;
    await AppDataSource.query(
      `INSERT IGNORE INTO growth_assess_webhook_deliveries(id,event_id,webhook_id,company_id,event_type,payload_json)
       VALUES(?,?,?,?,?,?)`,
      [randomUUID(), eventId, subscription.id, input.companyId, input.type, payload],
    );
  }
}

type DueDelivery = {
  id: string; eventId: string; eventType: string; payloadJson: string; targetUrl: string;
  encryptedSecret: string; attemptCount: number;
};

async function resolvePublicTarget(target: URL): Promise<{ address: string; family: number }> {
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await dnsLookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("WEBHOOK_TARGET_NOT_PUBLIC");
  return addresses[0];
}

async function sendDelivery(delivery: DueDelivery): Promise<{ status: number }> {
  const target = new URL(delivery.targetUrl);
  const address = await resolvePublicTarget(target);
  const body = delivery.payloadJson;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = decryptAssessWebhookSecret(delivery.encryptedSecret);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const lookupPinned = (...args: any[]) => {
    const callback = args[args.length - 1];
    callback(null, address.address, address.family);
  };
  return await new Promise((resolve, reject) => {
    const request = httpsRequest(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-StudyCod-Event": delivery.eventType,
        "X-StudyCod-Delivery": delivery.eventId,
        "X-StudyCod-Timestamp": timestamp,
        "X-StudyCod-Signature": `sha256=${signature}`,
        "User-Agent": "StudyCod-Assess-Webhooks/1.0",
      },
      lookup: lookupPinned as any,
      timeout: 10_000,
    }, response => {
      response.resume();
      response.on("end", () => resolve({ status: Number(response.statusCode ?? 0) }));
    });
    request.on("timeout", () => request.destroy(new Error("WEBHOOK_REQUEST_TIMEOUT")));
    request.on("error", reject);
    request.end(body);
  });
}

async function deliver(delivery: DueDelivery): Promise<void> {
  try {
    const response = await sendDelivery(delivery);
    if (response.status >= 200 && response.status < 300) {
      await AppDataSource.query(
        "UPDATE growth_assess_webhook_deliveries SET status='DELIVERED',last_http_status=?,last_error=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='DELIVERING'",
        [response.status, delivery.id],
      );
      return;
    }
    throw Object.assign(new Error(`WEBHOOK_HTTP_${response.status}`), { status: response.status });
  } catch (error) {
    const status = Number((error as { status?: number })?.status ?? 0) || null;
    const attemptCount = Number(delivery.attemptCount);
    const terminal = attemptCount >= 12;
    const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.min(10, attemptCount - 1))) + Math.floor(Math.random() * 10_000);
    const nextAttemptAt = new Date(Date.now() + delayMs);
    const message = String((error as Error)?.message ?? "WEBHOOK_DELIVERY_FAILED").slice(0, 512);
    await AppDataSource.query(
      `UPDATE growth_assess_webhook_deliveries SET status=?,last_http_status=?,last_error=?,next_attempt_at=?,completed_at=? WHERE id=? AND status='DELIVERING'`,
      [terminal ? "DEAD" : "PENDING", status, message, nextAttemptAt, terminal ? new Date() : null, delivery.id],
    );
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

async function webhookWorkerTick(): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;
  try {
    await AppDataSource.query(
      "UPDATE growth_assess_webhook_deliveries SET status='PENDING',next_attempt_at=UTC_TIMESTAMP(3) WHERE status='DELIVERING' AND updated_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 MINUTE)",
    );
    const batch = await AppDataSource.transaction(async manager => {
      const rows = await manager.query(
        `SELECT d.id,d.event_id AS eventId,d.event_type AS eventType,d.payload_json AS payloadJson,d.attempt_count AS attemptCount,
                w.target_url AS targetUrl,w.encrypted_secret AS encryptedSecret
         FROM growth_assess_webhook_deliveries d JOIN growth_assess_webhooks w ON w.id=d.webhook_id AND w.enabled=1
         WHERE d.status='PENDING' AND d.next_attempt_at<=UTC_TIMESTAMP(3)
         ORDER BY d.created_at ASC LIMIT 12 FOR UPDATE SKIP LOCKED`,
      ) as DueDelivery[];
      for (const row of rows) {
        await manager.query("UPDATE growth_assess_webhook_deliveries SET status='DELIVERING',attempt_count=attempt_count+1 WHERE id=? AND status='PENDING'", [row.id]);
        row.attemptCount = Number(row.attemptCount) + 1;
      }
      return rows;
    });
    await Promise.all(batch.map(deliver));
  } catch (error) {
    logger.error("[assess:webhooks] delivery tick failed", { err: error });
  } finally {
    workerBusy = false;
  }
}

export function startAssessWebhookDeliveryWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => { void webhookWorkerTick(); }, 5_000);
  void webhookWorkerTick();
  logger.info("[assess:webhooks] delivery worker started", { intervalMs: 5_000 });
}
