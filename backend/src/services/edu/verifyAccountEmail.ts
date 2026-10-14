import crypto from "crypto";
import { AppDataSource } from "../../data-source";
import { User } from "../../entities/User";
import { Organization } from "../../entities/Organization";
import { Membership } from "../../entities/Membership";
import { EduRegistrationIntent } from "../../entities/EduRegistrationIntent";
import { slugifyBase } from "./membership";
import { HttpError } from "../../utils/httpError";

/** Consume email proof and pending school registration together, exactly once. */
export async function verifyEducationalAccountEmail(userId: number, token: string): Promise<User | null> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const repo = manager.getRepository(User);
    const user = await repo.findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
    if (!user || user.emailVerified || user.emailVerificationToken !== token || !user.emailVerificationExpires || user.emailVerificationExpires <= new Date()) return null;
    const intents = manager.getRepository(EduRegistrationIntent);
    const intent = await intents.findOne({ where: { userId }, lock: { mode: "pessimistic_write" } });
    if (intent && intent.expiresAt <= new Date()) throw new HttpError(400, "EDU_REGISTRATION_EXPIRED");
    if (intent) {
      const orgs = manager.getRepository(Organization), baseSlug = slugifyBase(intent.organizationName);
      let organization: Organization | undefined;
      for (let attempt = 0; attempt < 7; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomBytes(6).toString("hex")}`;
        try {
          organization = await orgs.save(orgs.create({ name: intent.organizationName, institutionType: intent.institutionType, slug }));
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
        }
      }
      if (!organization) throw new Error("ORGANIZATION_SLUG_UNAVAILABLE");
      await manager.getRepository(Membership).save({ user: { id: user.id }, organization: { id: organization.id }, role: "ORG_ADMIN" });
      await intents.delete(intent.id);
    }
    await repo.update(user.id, { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null });
    return repo.findOneByOrFail({ id: user.id });
  });
}
