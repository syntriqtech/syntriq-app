"use client";

import { useEffect, useState } from "react";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { fetchUserProfile, saveUserProfile } from "@/lib/userProfileDb";
import { createClient } from "@/lib/supabase/client";

export default function AccountSettingsPage() {
  const [fullName, setFullName]   = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [authEmail, setAuthEmail] = useState("");

  const [isLoading, setIsLoading]     = useState(true);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        setAuthEmail(userData.user?.email ?? "");

        const profile = await fetchUserProfile();
        if (profile) {
          setFullName(profile.fullName);
          setRoleTitle(profile.roleTitle);
        } else if (userData.user?.user_metadata?.full_name) {
          setFullName(userData.user.user_metadata.full_name);
        }
      } catch {
        // silently fall through — fields stay empty
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      await saveUserProfile(fullName.trim(), roleTitle.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Account Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Your personal profile — separate from your company&apos;s information.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="mb-5 text-base font-semibold text-navy">Your information</h2>

        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Read-only auth email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Email</label>
              <p className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
                {authEmail || "—"}
              </p>
              <p className="text-xs text-gray-400">Your login email cannot be changed here.</p>
            </div>

            <TextField
              id="fullName"
              label="Full name"
              placeholder="e.g. Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />

            <TextField
              id="roleTitle"
              label="Role / title"
              placeholder="e.g. Project Manager, Owner, Estimator"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
            />

            <p className="text-xs text-gray-400">
              Your name and title are used to pre-fill signer fields on pay applications and lien waivers.
            </p>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            {saveSuccess && <p className="text-sm text-teal">Saved.</p>}

            <Button type="submit" disabled={isSaving} className="mt-1">
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
