import "reflect-metadata";
import dotenv from "dotenv";
import path from "path";
const envPath = path.resolve(process.cwd(), ".env");
const envResult = dotenv.config({
  path: envPath,
  override: true
});
if (envResult.error) {
  console.warn(`⚠️  Warning: Could not load .env file from ${envPath}`);
  console.warn(`   Error: ${envResult.error.message}`);
  console.warn("   Using environment variables or defaults...");
} else {
  console.log(`✓ Loaded .env file from: ${envPath}`);
}
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import bcrypt from "bcryptjs";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@studycod.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "system_admin";
async function seedSystemAdmin() {
  try {
    console.log("\nInitializing database connection...");
    console.log("Connection settings:");
    console.log(`  Host: ${process.env.DB_HOST || "localhost"}`);
    console.log(`  Port: ${process.env.DB_PORT || 3306}`);
    console.log(`  Database: ${process.env.DB_NAME || "studycod"}`);
    console.log(`  User: ${process.env.DB_USER || "root"}`);
    if (process.env.DATABASE_URL) {
      const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
      console.log(`  DATABASE_URL: ${maskedUrl.substring(0, 60)}...`);
      console.log("  Note: Using DATABASE_URL for connection");
    } else {
      console.log("  Note: Using individual DB_* variables for connection");
    }
    if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
      console.warn("  ⚠️  Warning: DB_HOST not set, using default: localhost");
    }
    await AppDataSource.initialize();
    console.log("Database connection established.");
    const userRepo = AppDataSource.getRepository(User);
    const existingAdmin = await userRepo.findOne({
      where: {
        role: "SYSTEM_ADMIN"
      }
    });
    if (existingAdmin) {
      console.log(`SYSTEM_ADMIN already exists: ${existingAdmin.username} (ID: ${existingAdmin.id})`);
      if (process.env.ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        existingAdmin.password = hashedPassword;
        await userRepo.save(existingAdmin);
        console.log("Admin password updated from environment variable.");
      }
      await AppDataSource.destroy();
      return;
    }
    const existingUser = await userRepo.findOne({
      where: [{
        username: ADMIN_USERNAME
      }, {
        email: ADMIN_EMAIL
      }]
    });
    if (existingUser) {
      console.log(`User with username "${ADMIN_USERNAME}" or email "${ADMIN_EMAIL}" already exists.`);
      console.log("Updating to SYSTEM_ADMIN role...");
      existingUser.role = "SYSTEM_ADMIN";
      existingUser.emailVerified = true;
      if (process.env.ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        existingUser.password = hashedPassword;
      }
      await userRepo.save(existingUser);
      console.log(`User updated to SYSTEM_ADMIN: ${existingUser.username} (ID: ${existingUser.id})`);
      await AppDataSource.destroy();
      return;
    }
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = userRepo.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
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
    console.log("\n==========================================");
    console.log("SYSTEM_ADMIN created successfully!");
    console.log("==========================================");
    console.log(`Username: ${ADMIN_USERNAME}`);
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`ID: ${admin.id}`);
    console.log("==========================================\n");
    console.log("⚠️  IMPORTANT: Change the default password immediately!");
    console.log("Set ADMIN_PASSWORD in .env file for production.\n");
    await AppDataSource.destroy();
  } catch (error: any) {
    console.error("\n❌ Error seeding SYSTEM_ADMIN:", error.message || error);
    if (error.code === "ECONNREFUSED") {
      console.error("\n⚠️  MySQL server is not running or not accessible!");
      console.error("Please ensure:");
      console.error("  1. MySQL server is running");
      console.error("  2. Connection settings in .env file are correct:");
      console.error("     DB_HOST=localhost");
      console.error("     DB_PORT=3306");
      console.error("     DB_USER=root");
      console.error("     DB_PASS=your_password");
      console.error("     DB_NAME=studycod");
      console.error("\nTo start MySQL on Windows:");
      console.error("  - Check if MySQL service is running: services.msc");
      console.error("  - Or start MySQL manually from installation directory");
    } else if (error.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("\n⚠️  Database access denied!");
      console.error("Please check DB_USER and DB_PASS in .env file");
    } else if (error.code === "ER_BAD_DB_ERROR") {
      console.error("\n⚠️  Database does not exist!");
      console.error(`Please create database: ${process.env.DB_NAME || "studycod"}`);
    } else {
      console.error("\nFull error:", error);
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
}
seedSystemAdmin();