"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button, Input, Spinner } from "@/components/ui";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v3.9h6c-.1 1-.8 2.5-2.3 3.5v2.9h3.7c2.1-2 3.2-4.9 3.2-8.3Z" />
      <path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.5-2.8l-3.7-2.9c-1 .7-2.3 1.2-3.9 1.2-3 0-5.5-2-6.4-4.7H1.8v3C3.6 20.4 7.5 23 12 23Z" />
      <path fill="#FBBC05" d="M5.6 13.8c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2v-3H1.8C1 8 .6 9.8.6 11.6s.4 3.6 1.2 5.2l3.8-3Z" />
      <path fill="#EA4335" d="M12 4.7c1.7 0 3.2.6 4.3 1.7l3.3-3.2C17.7 1.3 15.1.3 12 .3 7.5.3 3.6 2.8 1.8 6.4l3.8 3C6.5 6.7 9 4.7 12 4.7Z" />
    </svg>
  );
}

/** Login card from the Figma. Google OAuth is the real sign-in; email/password is not offered by the backend. */
export function LoginCard({ error }: { error?: string }) {
  const [loading, setLoading] = useState(false);
  const google = () => {
    setLoading(true);
    void signIn("google", { callbackUrl: "/dashboard" });
  };
  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.info("Email sign-up isn't enabled for this demo – please use Login with Google.");
  };

  return (
    <div className="w-full max-w-[520px] rounded-2xl border border-ink-200 bg-white px-8 py-10 sm:px-16">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-ink-900">Login</h1>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700">Sign-in failed: {error}. Is the backend running?</p>}
      <button
        type="button"
        onClick={google}
        disabled={loading}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-50 text-sm text-ink-900 transition-colors hover:bg-brand-100 disabled:opacity-70"
      >
        {loading ? <Spinner className="h-4 w-4" /> : <GoogleIcon />} Login with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-2xs text-ink-400">
        <span className="h-px flex-1 bg-ink-200" /> or sign up through email <span className="h-px flex-1 bg-ink-200" />
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3">
        <Input type="email" placeholder="Email ID" aria-label="Email ID" autoComplete="email" />
        <Input type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" />
        <Button type="submit" size="lg" className="!mt-6 w-full">
          Login
        </Button>
      </form>
    </div>
  );
}
