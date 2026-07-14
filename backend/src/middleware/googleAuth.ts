import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { getGoogleClientId, getGoogleClientSecret, getGoogleCallbackUrl, isGoogleOAuthEnabled } from "../config/googleOAuth";
import { logger } from "../utils/logger";
const getUserRepository = () => AppDataSource.getRepository(User);

export function setupGoogleStrategy() {
  if (!isGoogleOAuthEnabled()) {
    return;
  }
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const callbackUrl = getGoogleCallbackUrl();
  passport.use(new GoogleStrategy({
    clientID: clientId,
    clientSecret: clientSecret,
    callbackURL: callbackUrl,
    passReqToCallback: true
  }, async (req: any, _accessToken, _refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value || null;
      const firstName = profile.name?.givenName || null;
      const lastName = profile.name?.familyName || null;
      const avatarUrl = profile.photos?.[0]?.value || null;
      let birthDay: number | null = null;
      let birthMonth: number | null = null;
      const profileJson = profile._json as any;
      if (profileJson?.birthday) {
        const birthday = new Date(profileJson.birthday);
        if (!isNaN(birthday.getTime())) {
          birthDay = birthday.getDate();
          birthMonth = birthday.getMonth() + 1;
        }
      }
      const linkUserId = Number((req?.session as any)?.googleLinkUserId ?? 0);
      if (Number.isFinite(linkUserId) && linkUserId > 0) {
        return done(null, {
          googleId,
          email,
          firstName,
          lastName,
          avatarUrl,
          birthDay,
          birthMonth,
          isGoogleLinkFlow: true,
          linkUserId
        });
      }
      let user = await getUserRepository().findOne({
        where: {
          googleId
        }
      });
      if (user) {
        if (email && !user.email) user.email = email;
        if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
        await getUserRepository().save(user);
        return done(null, user);
      }
      if (email) {
        user = await getUserRepository().findOne({
          where: {
            email
          }
        });
        if (user) {
          // Google is the shared identity provider for all StudyCod surfaces.
          // A single verified email must not create a second account just
          // because the user opened EDU or Contest from the mode switcher.
          user.googleId = googleId;
          if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
          await getUserRepository().save(user);
          return done(null, user);
        }
      }
      return done(null, {
        googleId,
        email,
        firstName,
        lastName,
        avatarUrl,
        birthDay,
        birthMonth,
        isNewUser: true
      });
    } catch (error: any) {
      logger.error('[auth] google oauth error', { message: error?.message });
      return done(error, false);
    }
  }));
  passport.serializeUser((user: any, done) => {
    done(null, user.id ?? user.googleId);
  });
  passport.deserializeUser(async (id: string | number, done) => {
    try {
      if (typeof id === "number") {
        const user = await getUserRepository().findOne({
          where: {
            id
          }
        });
        return done(null, user);
      }
      return done(null, {
        googleId: id,
        isNewUser: true
      });
    } catch (error) {
      return done(error, false);
    }
  });
}
