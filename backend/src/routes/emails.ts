import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Student } from "../entities/Student";
import { JWT_SECRET, FRONTEND_URL } from "../config";
import { logger } from "../utils/logger";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);

type EmailPrefToken = {
  t: "email-pref";
  action: "unsubscribe" | "subscribe";
  kind: "user" | "student";
  id: number;
  email: string;
};

function frontendEmailPrefsUrl(params: {
  action: "subscribe" | "unsubscribe";
  ok: boolean;
  email?: string;
  reason?: string;
}) {
  const base = String(FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  const qp = new URLSearchParams();
  qp.set("action", params.action);
  qp.set("ok", params.ok ? "1" : "0");
  if (params.email) qp.set("email", params.email);
  if (params.reason) qp.set("reason", params.reason);
  return `${base}/email-preferences?${qp.toString()}`;
}

function wantsJson(req: Request): boolean {
  return String(req.query.format || "").toLowerCase() === "json";
}

function verifyToken(raw: string): EmailPrefToken {
  const decoded = jwt.verify(raw, JWT_SECRET) as any;
  if (!decoded || decoded.t !== "email-pref") throw new Error("INVALID_TOKEN");
  if (decoded.action !== "unsubscribe" && decoded.action !== "subscribe") throw new Error("INVALID_TOKEN");
  if (decoded.kind !== "user" && decoded.kind !== "student") throw new Error("INVALID_TOKEN");
  if (typeof decoded.id !== "number" || !Number.isFinite(decoded.id)) throw new Error("INVALID_TOKEN");
  if (typeof decoded.email !== "string" || !decoded.email.includes("@")) throw new Error("INVALID_TOKEN");
  return decoded as EmailPrefToken;
}

async function applyPreference(token: EmailPrefToken): Promise<{ email: string; enabled: boolean } | null> {
  const enabled = token.action === "subscribe";

  if (token.kind === "student") {
    const student = await studentRepo().findOne({ where: { id: token.id } });
    if (!student) return null;
    if (String(student.email || "").toLowerCase() !== token.email.toLowerCase()) return null;
    student.marketingEmailsEnabled = enabled;
    await studentRepo().save(student);
    return { email: student.email, enabled: Boolean(student.marketingEmailsEnabled) };
  }

  const user = await userRepo().findOne({ where: { id: token.id } });
  if (!user) return null;
  if (String(user.email || "").toLowerCase() !== token.email.toLowerCase()) return null;
  user.marketingEmailsEnabled = enabled;
  await userRepo().save(user);
  return { email: user.email || token.email, enabled: Boolean(user.marketingEmailsEnabled) };
}

router.get("/unsubscribe", async (req: Request, res: Response) => {
  try {
    const tokenRaw = String(req.query.token || "").trim();
    if (!tokenRaw) {
      if (wantsJson(req)) return res.status(400).json({ message: "MISSING_TOKEN" });
      return res.redirect(302, frontendEmailPrefsUrl({ action: "unsubscribe", ok: false, reason: "MISSING_TOKEN" }));
    }

    const token = verifyToken(tokenRaw);
    // Force action
    token.action = "unsubscribe";

    const updated = await applyPreference(token);
    if (!updated) {
      if (wantsJson(req)) return res.status(404).json({ message: "NOT_FOUND" });
      return res.redirect(302, frontendEmailPrefsUrl({ action: "unsubscribe", ok: false, reason: "NOT_FOUND" }));
    }

    if (!wantsJson(req)) {
      return res.redirect(
        302,
        frontendEmailPrefsUrl({ action: "unsubscribe", ok: true, email: updated.email })
      );
    }

    return res.json({ ok: true, ...updated, frontend: FRONTEND_URL });
  } catch (err: any) {
    logger.warn("[emails] unsubscribe failed", { err: err?.message || err });
    if (wantsJson(req)) return res.status(400).json({ message: "INVALID_TOKEN" });
    return res.redirect(302, frontendEmailPrefsUrl({ action: "unsubscribe", ok: false, reason: "INVALID_TOKEN" }));
  }
});

router.get("/subscribe", async (req: Request, res: Response) => {
  try {
    const tokenRaw = String(req.query.token || "").trim();
    if (!tokenRaw) {
      if (wantsJson(req)) return res.status(400).json({ message: "MISSING_TOKEN" });
      return res.redirect(302, frontendEmailPrefsUrl({ action: "subscribe", ok: false, reason: "MISSING_TOKEN" }));
    }

    const token = verifyToken(tokenRaw);
    token.action = "subscribe";

    const updated = await applyPreference(token);
    if (!updated) {
      if (wantsJson(req)) return res.status(404).json({ message: "NOT_FOUND" });
      return res.redirect(302, frontendEmailPrefsUrl({ action: "subscribe", ok: false, reason: "NOT_FOUND" }));
    }

    if (!wantsJson(req)) {
      return res.redirect(
        302,
        frontendEmailPrefsUrl({ action: "subscribe", ok: true, email: updated.email })
      );
    }

    return res.json({ ok: true, ...updated, frontend: FRONTEND_URL });
  } catch (err: any) {
    logger.warn("[emails] subscribe failed", { err: err?.message || err });
    if (wantsJson(req)) return res.status(400).json({ message: "INVALID_TOKEN" });
    return res.redirect(302, frontendEmailPrefsUrl({ action: "subscribe", ok: false, reason: "INVALID_TOKEN" }));
  }
});

export default router;
