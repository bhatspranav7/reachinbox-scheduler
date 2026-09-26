import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Google OAuth via NextAuth. On sign-in we hand Google's ID token to the
 * backend, which verifies it and returns its own API token. That token is kept
 * in the (encrypted) NextAuth JWT and exposed to the client through the session.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {
        try {
          const res = await fetch(`${API_URL}/api/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: account.id_token }),
          });
          if (!res.ok) throw new Error(`backend auth failed (${res.status})`);
          const data = (await res.json()) as { token: string; user: { id: string } };
          token.backendToken = data.token;
          token.userId = data.user.id;
          token.error = undefined;
        } catch (err) {
          token.error = (err as Error).message;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.backendToken = token.backendToken;
      session.userId = token.userId;
      session.error = token.error;
      return session;
    },
  },
};
