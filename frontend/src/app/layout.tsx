import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/pixelify-sans/700.css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReachInbox Scheduler",
  description: "Schedule and send emails at scale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
