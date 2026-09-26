import { withAuth } from "next-auth/middleware";

/** Only signed-in users can reach the app screens; others go to the login page. */
export default withAuth({ pages: { signIn: "/" } });

export const config = { matcher: ["/dashboard/:path*", "/compose", "/emails/:path*"] };
