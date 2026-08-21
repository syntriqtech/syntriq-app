"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // createBrowserClient defaults to the PKCE flow, so the recovery email
    // links here to /reset-password?code=... rather than a #access_token
    // hash fragment (confirmed against an actual sent email) — that code
    // has to be explicitly exchanged for a session, or it just sits in the
    // URL unprocessed and this page always falls through to "invalid or
    // expired" a few seconds later, even on a link that's perfectly valid.
    async function resolveSession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled && !error) {
          setLinkValid(true);
          setIsCheckingLink(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        setLinkValid(true);
        setIsCheckingLink(false);
      }
    }

    resolveSession();

    // Fallback for the implicit/hash-token flow, in case flowType is ever
    // changed back — PASSWORD_RECOVERY fires once Supabase resolves it.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session))) {
        setLinkValid(true);
        setIsCheckingLink(false);
      }
    });

    const timeout = setTimeout(() => {
      if (!cancelled) setIsCheckingLink(false);
    }, 3000);

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmError(null);

    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords don't match");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <Image src="/SyntriqLogo2.png" alt="Syntriq" width={96} height={96} priority />
          <h1 className="mt-2 text-xl font-semibold text-navy">Set a new password</h1>
        </div>

        {isCheckingLink ? (
          <p className="mt-6 text-center text-sm text-gray-500">Checking your reset link…</p>
        ) : !linkValid ? (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-red-600">
              This reset link is invalid or has expired.
            </p>
            <Link href="/" className="text-sm text-teal hover:underline">
              Back to log in
            </Link>
          </div>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <TextField
              id="newPassword"
              label="New password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <TextField
              id="confirmPassword"
              label="Confirm password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmError(null);
              }}
              required
              minLength={6}
              error={confirmError ?? undefined}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="mt-2" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : "Reset password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
