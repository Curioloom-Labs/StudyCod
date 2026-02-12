import "reflect-metadata";
import dotenv from "dotenv";
import path from "path";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath, override: true });

const adminEmail = process.env.ADMIN_EMAIL || "admin@studycod.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const adminUsername = process.env.ADMIN_USERNAME || "system_admin";

function maskDbUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ":****@");
}

function connectionHint(): Record<string, unknown> {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) return { databaseUrl: maskDbUrl(dbUrl).slice(0, 160) };
  return {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || "studycod",
    user: process.env.DB_USER || "root",
  };
}

async function seedSystemAdmin() {
  logger.info("[seed-admin] starting", { envPath, ...connectionHint() });

  try {
    await AppDataSource.initialize();
    const userRepo = AppDataSource.getRepository(User);
    const existingAdmin = await userRepo.findOne({
      where: {
        role: "SYSTEM_ADMIN"
      }
    });
    if (existingAdmin) {
      logger.info("[seed-admin] exists", { id: existingAdmin.id, username: existingAdmin.username });
      if (process.env.ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        existingAdmin.password = hashedPassword;
        await userRepo.save(existingAdmin);
        logger.info("[seed-admin] password updated");
      }
      await AppDataSource.destroy();
      return;
    }
    const existingUser = await userRepo.findOne({
      where: [{
        username: adminUsername
      }, {
        email: adminEmail
      }]
    });
    if (existingUser) {
        logger.info("[seed-admin] user found, promoting", { id: existingUser.id, username: existingUser.username });
      existingUser.role = "SYSTEM_ADMIN";
      existingUser.emailVerified = true;
      if (process.env.ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        existingUser.password = hashedPassword;
      }
      await userRepo.save(existingUser);
        logger.info("[seed-admin] promoted", { id: existingUser.id, username: existingUser.username });
      await AppDataSource.destroy();
      return;
    }
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = userRepo.create({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      userMode: "PERSONAL",
      role: "SYSTEM_ADMIN",
      lang: "JAVA",
      emailVerified: true,
      difusJava: 0,
      difusPython: 0,
      firstName: "System",
      lastName: "Administrator"
    });
    await userRepo.save(admin);
    logger.info("[seed-admin] created", { id: admin.id, username: adminUsername, email: adminEmail });
    await AppDataSource.destroy();
  } catch (error: any) {
    logger.error("[seed-admin] failed", {
      code: error?.code,
      message: error?.message || String(error),
      ...connectionHint()
    });
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
}
seedSystemAdmin();