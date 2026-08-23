"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { checkActivationKey, redeemActivationKey } from "@/lib/activationKeyDb";
import { createUserProfileFromSignup } from "@/lib/userProfileDb";
import { finalizeAccountFromMetadata } from "@/lib/signupFinalization";
import { getInvitationPreview, InvitationPreview } from "@/lib/invitationsDb";

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager",
  project_accountant: "Project Accountant",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const inviteToken = searchParams.get("invite");

  const [mode, setMode] = useState<"login" | "signup" | "forgot">(inviteToken ? "signup" : "login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [activationKeyError, setActivationKeyError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  // Invite-driven signup: skips the activation-key gate entirely (this
  // person is joining an org that's already paying, not self-serving) and
  // locks the email field to the address the invite was actually sent to.
  const [invitePreview, setInvitePreview] = useState<InvitationPreview>(null);
  const [isCheckingInvite, setIsCheckingInvite] = useState(Boolean(inviteToken));
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;

    getInvitationPreview(inviteToken)
      .then((preview) => {
        if (cancelled) return;
        if (!preview) {
          // Single source of truth for the "invalid or expired" message
          // lives on /accept-invite — send them there instead of
          // duplicating it here.
          router.replace(`/accept-invite?token=${encodeURIComponent(inviteToken)}`);
          return;
        }
        setInvitePreview(preview);
        setEmail(preview.email);
        setMode("signup");
      })
      .catch(() => {
        if (!cancelled) setInviteError("Could not load this invite. Try the link again.");
      })
      .finally(() => {
        if (!cancelled) setIsCheckingInvite(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSignupMessage(null);
    setActivationKeyError(null);
    setIsSubmitting(true);

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setIsSubmitting(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSignupMessage("Check your email for a link to reset your password.");
      return;
    }

    if (mode === "login") {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setIsSubmitting(false);
        setError(signInError.message);
        return;
      }

      // Covers a user who signed up while "Confirm email" was on: the
      // activation key/invite token and name were stashed in their auth
      // metadata at signup (no session existed yet to redeem/accept), and
      // get finished here on their first login. No-op for everyone else.
      let pendingInviteToken: string | null = null;
      if (data.user) {
        const result = await finalizeAccountFromMetadata(data.user).catch(() => ({ inviteToken: null }));
        pendingInviteToken = result.inviteToken;
      }

      setIsSubmitting(false);

      // Either this login just consumed a stashed invite above, or the
      // visitor arrived via an invite link and chose to log in to an
      // existing account instead of signing up — either way, the actual
      // join (and its email-match / seat-cap checks) happens on
      // /accept-invite, not here.
      const tokenToAccept = pendingInviteToken || (invitePreview ? inviteToken : null);
      if (tokenToAccept) {
        router.push(`/accept-invite?token=${encodeURIComponent(tokenToAccept)}`);
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    // mode === "signup"
    if (inviteToken && invitePreview) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: invitePreview.email,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            invite_token: inviteToken,
          },
        },
      });
      if (signUpError) {
        setIsSubmitting(false);
        setError(signUpError.message);
        return;
      }

      if (!data.user || !data.session) {
        // Email confirmation is required on this Supabase project — the
        // invite token and name are stashed in auth metadata (see signUp
        // options above) and get accepted/saved on first login instead,
        // once a session exists. See finalizeAccountFromMetadata.
        setIsSubmitting(false);
        setSignupMessage("Account created. Check your email to confirm, then log in.");
        setMode("login");
        return;
      }

      await createUserProfileFromSignup(data.user.id, firstName.trim(), lastName.trim()).catch(() => {});
      await supabase.auth
        .updateUser({ data: { invite_token: null, first_name: null, last_name: null } })
        .catch(() => {});

      setIsSubmitting(false);
      // /accept-invite runs the actual join (org seat-cap check etc.) and
      // shows a friendly error there if it can't complete yet — the
      // account itself is already created either way.
      router.push(`/accept-invite?token=${encodeURIComponent(inviteToken)}`);
      router.refresh();
      return;
    }

    // Normal, non-invite signup — unchanged.
    const trimmedKey = activationKey.trim();

    const keyValid = await checkActivationKey(trimmedKey).catch(() => false);
    if (!keyValid) {
      setIsSubmitting(false);
      setActivationKeyError("Invalid or already-used activation key");
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          activation_key: trimmedKey,
        },
      },
    });
    if (signUpError) {
      setIsSubmitting(false);
      setError(signUpError.message);
      return;
    }

    if (!data.user || !data.session) {
      // Email confirmation is required on this Supabase project — the key
      // and name are stashed in auth metadata (see signUp options above)
      // and get redeemed/saved on first login instead, once a session
      // exists. See finalizeAccountFromMetadata.
      setIsSubmitting(false);
      setSignupMessage("Account created. Check your email to confirm, then log in.");
      setMode("login");
      return;
    }

    const redeemed = await redeemActivationKey(trimmedKey).catch(() => false);
    if (!redeemed) {
      setIsSubmitting(false);
      setActivationKeyError("Invalid or already-used activation key");
      return;
    }

    await createUserProfileFromSignup(data.user.id, firstName.trim(), lastName.trim());
    await supabase.auth
      .updateUser({ data: { activation_key: null, first_name: null, last_name: null } })
      .catch(() => {});

    setIsSubmitting(false);
    router.push("/company-setup");
    router.refresh();
  }

  if (isCheckingInvite) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Checking your invite…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/SyntriqLogo2.png"
            alt="Syntriq"
            width={96}
            height={96}
            priority
          />
          <h1 className="mt-2 text-xl font-semibold text-navy">
            {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Reset password"}
          </h1>
          {mode === "forgot" && (
            <p className="text-center text-sm text-gray-500">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          )}
          {invitePreview && (
            <p className="text-center text-sm text-gray-500">
              You&apos;ve been invited to join <strong className="text-navy">{invitePreview.organizationName}</strong>{" "}
              as a <strong className="text-navy">{ROLE_LABELS[invitePreview.role] || invitePreview.role}</strong>.
            </p>
          )}
          {inviteError && <p className="text-center text-sm text-red-600">{inviteError}</p>}
        </div>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="firstName"
                label="First Name"
                type="text"
                placeholder="Jane"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <TextField
                id="lastName"
                label="Last Name"
                type="text"
                placeholder="Doe"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          )}
          <TextField
            id="email"
            label="Email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            readOnly={Boolean(invitePreview)}
            title={invitePreview ? "This invite is locked to the email it was sent to." : undefined}
          />
          {mode !== "forgot" && (
            <TextField
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          )}
          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setSignupMessage(null);
              }}
              className="-mt-2 self-end text-sm text-teal hover:underline"
            >
              Forgot password?
            </button>
          )}
          {mode === "signup" && !invitePreview && (
            <TextField
              id="activationKey"
              label="Activation Key"
              type="text"
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              value={activationKey}
              onChange={(e) => {
                setActivationKey(e.target.value);
                setActivationKeyError(null);
              }}
              required
              error={activationKeyError ?? undefined}
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {signupMessage && <p className="text-sm text-teal">{signupMessage}</p>}

          <Button type="submit" className="mt-2" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait…"
              : mode === "login"
              ? "Log in"
              : mode === "signup"
              ? "Create account"
              : "Send reset link"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "login" : mode === "forgot" ? "login" : "signup");
              setError(null);
              setSignupMessage(null);
              setActivationKeyError(null);
            }}
            className="text-sm text-teal hover:underline"
          >
            {mode === "login"
              ? "Need an account? Create one"
              : mode === "signup"
              ? "Already have an account? Log in"
              : "Back to log in"}
          </button>
        </div>
      </div>
    </main>
  );
}
