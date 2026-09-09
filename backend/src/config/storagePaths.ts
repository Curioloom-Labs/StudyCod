import path from "path";
import { env } from "../env";

export const UPLOADS_ROOT = env.UPLOADS_DIR?.trim() || path.resolve(process.cwd(), "uploads");
