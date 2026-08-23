"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { getInvitationPreview, acceptInvitation, InvitationPreview } from "@/lib/invitationsDb";

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager",
  project_accountant: "Project Accountant",
};

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(Boolean(token));
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    Promise.all([supabase.auth.getUser(), getInvitationPreview(token)])
      .then(([{ data: userData }, previewData]) => {
        if (cancelled) return;
        setCurrentEmail(userData.user?.email ?? null);
        if (!previewData) {
          setPreviewError("This invite link is invalid or has expired. Ask them to resend it from Team & Users.");
        } else {
          setPreview(previewData);
        }
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : "Could not load this invite.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setIsAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptInvitation(token);
      if (result.status === "ok") {
        setAcceptedMessage(result.message);
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1200);
      } else {
        setAcceptError(result.message);
      }
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Could not accept this invite.");
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    setCurrentEmail(null);
    router.refresh();
  }

  const isLoggedIn = currentEmail !== null;
  const emailMismatch = isLoggedIn && preview && currentEmail!.toLowerCase() !== preview.email.toLowerCase();

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <Image src="/SyntriqLogo2.png" alt="Syntriq" width={96} height={96} priority />
          <h1 className="mt-2 text-xl font-semibold text-navy">You&apos;re invited</h1>
        </div>

        {isLoading ? (
          <p className="mt-6 text-center text-sm text-gray-500">Checking your invite…</p>
        ) : !token || previewError ? (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-red-600">
              {previewError || "This invite link is missing its token."}
            </p>
            <Link href="/" className="text-sm text-teal hover:underline">
              Back to log in
            </Link>
          </div>
        ) : acceptedMessage ? (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-teal">{acceptedMessage}</p>
            <p className="text-xs text-gray-400">Taking you to your dashboard…</p>
          </div>
        ) : !isLoggedIn ? (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-600">
              You&apos;ve been invited to join <strong className="text-navy">{preview!.organizationName}</strong> as a{" "}
              <strong className="text-navy">{ROLE_LABELS[preview!.role] || preview!.role}</strong>.
            </p>
            <Button
              type="button"
              onClick={() => router.push(`/?invite=${encodeURIComponent(token)}`)}
              className="w-auto px-6"
            >
              Continue
            </Button>
            <p className="text-xs text-gray-400">
              You&apos;ll be asked to create a password (or log in, if you already have a Syntriq account with{" "}
              {preview!.email}).
            </p>
          </div>
        ) : emailMismatch ? (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-600">
              This invite was sent to <strong className="text-navy">{preview!.email}</strong>, but you&apos;re logged
              in as <strong className="text-navy">{currentEmail}</strong>.
            </p>
            <p className="text-xs text-gray-400">
              Log out and use the invited email, or ask {preview!.organizationName} for a new invite to your current
              address.
            </p>
            <Button type="button" onClick={handleLogOut} className="w-auto px-6">
              Log out
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-600">
              You&apos;ve been invited to join <strong className="text-navy">{preview!.organizationName}</strong> as a{" "}
              <strong className="text-navy">{ROLE_LABELS[preview!.role] || preview!.role}</strong>.
            </p>
            {acceptError && <p className="text-sm text-red-600">{acceptError}</p>}
            <Button type="button" onClick={handleAccept} disabled={isAccepting} className="w-auto px-6">
              {isAccepting ? "Joining…" : "Accept"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
