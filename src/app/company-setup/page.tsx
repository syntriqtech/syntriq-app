"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { saveCompanyProfile, saveCompanyLogo } from "@/lib/companyProfileDb";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg"];

// Data-entry steps only — the welcome screen isn't counted in the progress dots.
const TOTAL_STEPS = 6;

export default function CompanySetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 = welcome, 1-6 = data steps

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  function goNext() {
    setError(null);
    setStep((s) => s + 1);
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function handleStepSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (canContinue) goNext();
  }

  function handleLogoFile(file: File) {
    setLogoError(null);
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Only PNG and JPG files are accepted.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("File is too large — maximum 5 MB.");
      return;
    }
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function finishSetup() {
    setError(null);
    setIsSubmitting(true);
    try {
      await saveCompanyProfile(
        companyName.trim(),
        streetAddress.trim(),
        city.trim(),
        stateField.trim(),
        zipCode.trim(),
        country.trim(),
        contactName.trim(),
        contactEmail.trim(),
        contactPhone.trim() || undefined
      );

      if (logoFile) {
        // Profile is already saved and complete at this point — a logo
        // upload hiccup shouldn't block getting into the app, since the
        // logo can always be added later from Company Profile settings.
        await saveCompanyLogo(logoFile).catch((err) => {
          console.error("Logo upload failed:", err);
        });
      }

      setIsSubmitting(false);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Could not save your company profile.");
    }
  }

  const canContinue =
    step === 1 ? companyName.trim().length > 0 :
    step === 2 ? contactName.trim().length > 0 :
    step === 4 ? contactEmail.trim().length > 0 :
    true; // address (3) and phone (5) are optional

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md animate-fade-slide-up rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <Image src="/SyntriqLogo2.png" alt="Syntriq" width={72} height={72} priority />
        </div>

        {step > 0 && (
          <div className="mt-6 flex justify-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full transition-all duration-300 ease-out ${
                  i < step ? "bg-teal" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        )}

        <div key={step} className="animate-fade-slide-up">
        {step === 0 && (
          <div className="mt-6 flex flex-col items-center gap-4 text-center">
            <h1 className="text-xl font-semibold text-navy">Welcome to Syntriq</h1>
            <p className="text-sm text-gray-500">
              Let&apos;s set up your company profile — this powers your pay applications and lien
              waivers.
            </p>
            <Button
              type="button"
              className="mt-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
              onClick={goNext}
            >
              Get Started
            </Button>
          </div>
        )}

        {step >= 1 && step <= 5 && (
          <form onSubmit={handleStepSubmit} className="mt-6 flex flex-col gap-4">
            {step === 1 && (
              <>
                <h2 className="text-center text-lg font-semibold text-navy">
                  What&apos;s your company name?
                </h2>
                <TextField
                  id="companyName"
                  label="Company name"
                  placeholder="e.g., Legacy Construction"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoFocus
                  required
                />
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-center text-lg font-semibold text-navy">
                  Who&apos;s the main contact?
                </h2>
                <TextField
                  id="contactName"
                  label="Contact name"
                  placeholder="e.g., Jane Doe"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  autoFocus
                  required
                />
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-center text-lg font-semibold text-navy">
                  What&apos;s your company address?
                </h2>
                <TextField
                  id="streetAddress"
                  label="Street address"
                  placeholder="e.g., 4820 Harbor Industrial Way"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  autoFocus
                />
                <TextField
                  id="city"
                  label="City"
                  placeholder="e.g., Long Beach"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    id="stateField"
                    label="State"
                    placeholder="e.g., CA"
                    value={stateField}
                    onChange={(e) => setStateField(e.target.value)}
                  />
                  <TextField
                    id="zipCode"
                    label="ZIP code"
                    placeholder="e.g., 90802"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                  />
                </div>
                <TextField
                  id="country"
                  label="Country"
                  placeholder="e.g., USA"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="text-center text-lg font-semibold text-navy">
                  What&apos;s your business email?
                </h2>
                <TextField
                  id="contactEmail"
                  label="Email address"
                  type="email"
                  placeholder="e.g., jason@company.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  autoFocus
                  required
                />
              </>
            )}

            {step === 5 && (
              <>
                <h2 className="text-center text-lg font-semibold text-navy">
                  What&apos;s your phone number?
                </h2>
                <TextField
                  id="contactPhone"
                  label="Phone (optional)"
                  type="tel"
                  placeholder="e.g., (555) 123-4567"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  autoFocus
                />
              </>
            )}

            <div className="mt-4 flex flex-col gap-3">
              <Button
                type="submit"
                disabled={!canContinue}
                className="transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Continue
              </Button>
              {step === 5 && (
                <button type="button" onClick={goNext} className="text-sm text-teal hover:underline">
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {step === 6 && (
          <div className="mt-6 flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold text-navy">Add your company logo</h2>
            <p className="text-center text-sm text-gray-500">
              Appears at the top-left of every invoice cover page. PNG or JPG, max 5 MB.
            </p>

            <div className="flex flex-col items-center gap-4">
              <div className="flex h-[90px] w-[240px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="max-h-[90px] max-w-[240px] animate-fade-slide-up object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No logo selected</span>
                )}
              </div>
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
                onClick={() => logoInputRef.current?.click()}
                className="rounded-lg border border-teal px-4 py-2 text-sm font-semibold text-teal hover:bg-teal/10"
              >
                {logoFile ? "Choose a different file" : "Upload Logo"}
              </button>
              {logoError && <p className="text-sm text-red-600">{logoError}</p>}
            </div>

            {error && <p className="text-center text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex flex-col gap-3">
              <Button
                type="button"
                onClick={finishSetup}
                disabled={!logoFile || isSubmitting}
                className="transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {isSubmitting ? "Saving…" : "Finish"}
              </Button>
              <button
                type="button"
                onClick={finishSetup}
                disabled={isSubmitting}
                className="text-sm text-teal hover:underline disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={goBack}
                disabled={isSubmitting}
                className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
              >
                Back
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
