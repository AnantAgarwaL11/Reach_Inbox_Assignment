import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AuthenticatedUser } from '../types';

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        // Upsert: find the user by their stable Google ID, or create them.
        // We use upsert rather than findFirst + create to handle the race
        // condition where two login requests arrive simultaneously for the
        // same new user.
        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            name: profile.displayName,
            email: profile.emails?.[0]?.value ?? '',
            avatar: profile.photos?.[0]?.value ?? null,
          },
          create: {
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails?.[0]?.value ?? '',
            avatar: profile.photos?.[0]?.value ?? null,
          },
        });

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

// Serialise only the user ID into the session cookie.
// The full user object is re-fetched from the database on each request,
// so changes (name, avatar) are always current.
passport.serializeUser((user, done) => {
  done(null, (user as AuthenticatedUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;
