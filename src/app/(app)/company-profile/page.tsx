"use client";

import { useEffect, useRef, useState } from "react";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { saveCompanyProfile, saveCompanyLogo, removeCompanyLogo } from "@/lib/companyProfileDb";
import TextField from "@/components/TextField";
import Button from "@/components/Button";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

export default function CompanyProfilePage() {
  const { profile, isLoading, error: loadError } = useCompanyProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setCompanyName(profile.companyName);
      setStreetAddress(profile.streetAddress);
      setCity(profile.city);
      setStateField(profile.state);
      setZipCode(profile.zipCode);
      setCountry(profile.country || "USA");
      setContactName(profile.contactName);
      setContactEmail(profile.contactEmail);
      setContactPhone(profile.contactPhone || "");
      setLogoUrl(profile.logoUrl);
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    try {
      await saveCompanyProfile(companyName, streetAddress, city, stateField, zipCode, country, contactName, contactEmail, contactPhone || undefined);
      window.dispatchEvent(new Event("company-profile-updated"));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save company profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogoFile(file: File) {
    setLogoError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLogoError("Only PNG and JPG files are accepted.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("File is too large — maximum 5 MB.");
      return;
    }
    setIsUploadingLogo(true);
    try {
      const url = await saveCompanyLogo(file);
      // Append cache-bust so the preview shows the new image immediately
      setLogoUrl(`${url}?t=${Date.now()}`);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not upload logo.");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    setLogoError(null);
    setIsRemovingLogo(true);
    try {
      await removeCompanyLogo();
      setLogoUrl(undefined);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not remove logo.");
    } finally {
      setIsRemovingLogo(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Company Profile</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Company Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your company information is used on all generated documents (pay applications, lien waivers, etc.).
        </p>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <form onSubmit={handleSave} className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-bold text-navy">Contractor Information</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Company name"
            id="companyName"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g., Legacy Construction"
          />
          <TextField
            label="Contact name"
            id="contactName"
            required
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="e.g., Jane Doe"
          />
          <div className="sm:col-span-2">
            <TextField
              label="Street address"
              id="streetAddress"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="e.g., 4820 Harbor Industrial Way"
            />
          </div>
          <TextField
            label="City"
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g., Long Beach"
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="State"
              id="stateField"
              value={stateField}
              onChange={(e) => setStateField(e.target.value)}
              placeholder="e.g., CA"
            />
            <TextField
              label="ZIP code"
              id="zipCode"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="e.g., 90802"
            />
          </div>
          <TextField
            label="Country"
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g., USA"
          />
          <TextField
            label="Email address"
            id="contactEmail"
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="e.g., jason@company.com"
          />
          <TextField
            label="Phone (optional)"
            id="contactPhone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="e.g., (555) 123-4567"
          />
        </div>

        {saveError && <p className="mt-3 text-sm text-red-600">{saveError}</p>}
        {saveSuccess && <p className="mt-3 text-sm text-green-600">Company profile saved successfully.</p>}

        <div className="mt-6">
          <Button type="submit" disabled={isSaving} className="w-auto px-6">
            {isSaving ? "Saving…" : "Save Company Profile"}
          </Button>
        </div>
      </form>

      {/* Logo section */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-bold text-navy">Company Logo</h2>
        <p className="mt-1 text-sm text-gray-500">
          Appears at the top-left of every invoice cover page. PNG or JPG, max 5 MB.
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Preview box */}
          <div className="flex h-[70px] w-[200px] flex-none items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Company logo preview"
                className="max-h-[70px] max-w-[200px] object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400">No logo uploaded</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!profile) {
                  setLogoError("Save your company profile first before uploading a logo.");
                  return;
                }
                logoInputRef.current?.click();
              }}
              disabled={isUploadingLogo || isRemovingLogo}
              className="rounded-lg border border-teal px-4 py-2 text-sm font-semibold text-teal hover:bg-teal/10 disabled:opacity-50"
            >
              {isUploadingLogo ? "Uploading…" : logoUrl ? "Replace Logo" : "Upload Logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={isUploadingLogo || isRemovingLogo}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isRemovingLogo ? "Removing…" : "Remove Logo"}
              </button>
            )}
            <p className="text-xs text-gray-400">
              The preview shows how your logo will be scaled on invoices.
            </p>
          </div>
        </div>

        {logoError && <p className="mt-3 text-sm text-red-600">{logoError}</p>}
      </div>
    </div>
  );
}
