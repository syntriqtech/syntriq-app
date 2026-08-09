"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { checkActivationKey, redeemActivationKey } from "@/lib/activationKeyDb";
import { createUserProfileFromSignup } from "@/lib/userProfileDb";
import { finalizeAccountFromMetadata } from "@/lib/signupFinalization";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [activationKeyError, setActivationKeyError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSignupMessage(null);
    setActivationKeyError(null);
    setIsSubmitting(true);

    if (mode === "login") {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setIsSubmitting(false);
        setError(signInError.message);
        return;
      }

      // Covers a user who signed up while "Confirm email" was on: the
      // activation key and name were stashed in their auth metadata at
      // signup (no session existed yet to redeem the key), and get finished
      // here on their first login. No-op for everyone else.
      if (data.user) {
        await finalizeAccountFromMetadata(data.user).catch(() => {});
      }

      setIsSubmitting(false);
      router.push("/dashboard");
      router.refresh();
    } else {
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
            {mode === "login" ? "Log in" : "Create account"}
          </h1>
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
          />
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
          {mode === "signup" && (
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
            {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setSignupMessage(null);
              setActivationKeyError(null);
            }}
            className="text-sm text-teal hover:underline"
          >
            {mode === "login" ? "Need an account? Create one" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </main>
  );
}
