import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Session token issued by our Express backend. */
    backendToken?: string;
    userId?: string;
    error?: string;
    user: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    userId?: string;
    error?: string;
  }
}
