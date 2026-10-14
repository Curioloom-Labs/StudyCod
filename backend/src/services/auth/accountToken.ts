import jwt from "jsonwebtoken";
import type { User } from "../../entities/User";
import { JWT_SECRET } from "../../config";
import { generateJti } from "./jwtRevocation";
import { hasClassIssuedUserLogin } from "../edu/classIssuedAccount";
import { eduUserPasswordVersion } from "../edu/studentCredentialVersion";
import { educationalUserTokenVersion } from "../edu/userSessions";
import { HttpError } from "../../utils/httpError";

/** The caller must have proved this User password snapshot or authenticated session. */
export async function signAccountUserToken(user: User, expectedVersion?: number): Promise<string> {
  const classIssued = user.userMode !== "CONTEST" && await hasClassIssuedUserLogin(user);
  const version = await educationalUserTokenVersion(user);
  if (expectedVersion !== undefined && version !== expectedVersion) throw new HttpError(401, "SESSION_CHANGED");
  return jwt.sign({ userId: user.id, role: user.role, userMode: user.userMode,
    ...(classIssued ? { eduPasswordVersion: eduUserPasswordVersion(user.password) } : {}),
    ...(version !== undefined ? { eduSessionVersion: version } : {}), jti: generateJti()
  }, JWT_SECRET, { expiresIn: "7d" });
}
