import "reflect-metadata";
import { randomBytes } from "crypto";
import * as fs from "fs/promises";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";

async function main(): Promise<void> {
  if (process.platform !== "linux" || process.getuid?.() !== 0) throw new Error("Run fixture provisioning as root on the authorised VPS");
  const output = process.argv[2];
  if (!output?.endsWith(".private.json")) throw new Error("Provide a private fixture file path");
  const file = await fs.open(output, "wx", 0o600);
  try {
    await AppDataSource.initialize();
    const password = randomBytes(32).toString("base64url");
    const username = `capacity_${Date.now()}`;
    await AppDataSource.transaction(async manager => {
      const user = manager.getRepository(User).create({ username, email: null,
        password: await bcrypt.hash(password, 10), emailVerified: true, role: "SYSTEM_ADMIN", userMode: "PERSONAL",
        marketingEmailsEnabled: false, difusJava: 0, difusPython: 0, difusCpp: 0 });
      const saved = await manager.save(user);
      await file.writeFile(JSON.stringify({ username, password, userId: saved.id }));
      await file.sync();
    });
  } catch (error) { await fs.rm(output, { force: true }); throw error; }
  finally {
    await file.close();
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
  console.log("Dedicated load-test organiser created; credentials saved privately.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
