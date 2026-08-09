"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSignupMessage(null);
    setIsSubmitting(true);

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setIsSubmitting(false);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      setIsSubmitting(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setSignupMessage("Account created. Check your email to confirm, then log in.");
      setMode("login");
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
