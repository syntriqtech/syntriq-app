"use client";

import { useEffect, useState } from "react";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { getContractorInfo } from "@/lib/sampleUser";

const CATEGORIES = [
  "Bug report",
  "Billing question",
  "Feature request",
  "Account & access",
  "Other",
];

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30";

export default function HelpSupportPage() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [userName, setUserName]       = useState("");
  const [userEmail, setUserEmail]     = useState("");
  const [userCompany, setUserCompany] = useState("");

  useEffect(() => {
    getContractorInfo().then((info) => {
      setUserName(info.name);
      setUserEmail(info.email);
      setUserCompany(info.company);
    }).catch(() => {});
  }, []);

  function validate() {
    if (!message.trim()) return "Message is required.";
    if (message.trim().length < 10) return "Message must be at least 10 characters.";
    if (message.length > 4000) return "Message must be under 4,000 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const err = validate();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email: userEmail,
          company: userCompany,
          category,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-gray-500">
          Have a question or ran into something? We&apos;re here to help.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* ── Contact form ───────────────────────────────────────────── */}
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="mb-5 text-base font-semibold text-navy">Send us a message</h2>

            {submitted ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-teal/20 bg-teal/5 p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/15">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d8f96" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-navy">Message received</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    Thanks — we&apos;ve received your message and will get back to you within 1 business day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setSubject(""); setMessage(""); setCategory(CATEGORIES[0]); }}
                  className="mt-1 text-sm font-medium text-teal hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Category */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="category" className="text-sm font-medium text-navy">
                    Category
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <TextField
                  id="subject"
                  label="Subject"
                  placeholder="Brief summary of your question"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                />

                {/* Message */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="message" className="text-sm font-medium text-navy">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    placeholder="Describe your issue or question in detail..."
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); if (validationError) setValidationError(null); }}
                    className={INPUT_CLASS}
                    maxLength={4000}
                  />
                  <div className="flex items-center justify-between">
                    {validationError
                      ? <p className="text-xs text-red-500">{validationError}</p>
                      : <span />
                    }
                    <p className="text-xs text-gray-400">{message.length}/4,000</p>
                  </div>
                </div>

                {submitError && (
                  <p className="text-sm text-red-600">{submitError}</p>
                )}

                <Button type="submit" disabled={isSubmitting} className="mt-1">
                  {isSubmitting ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* ── Contact info panel ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-navy">Other ways to reach us</h2>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</p>
                <a
                  href="mailto:syntriqtech@gmail.com"
                  className="mt-0.5 block text-sm text-teal hover:underline"
                >
                  syntriqtech@gmail.com
                </a>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Response time</p>
                <p className="mt-0.5 text-sm text-gray-600">We typically respond within 1 business day.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Hours</p>
                <p className="mt-0.5 text-sm text-gray-600">Monday – Friday, 8 AM – 5 PM PT</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="mb-3 text-base font-semibold text-navy">Quick tips</h2>
            <ul className="flex flex-col gap-2.5 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="mt-0.5 flex-none text-teal">→</span>
                Include your job number when reporting a billing issue.
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex-none text-teal">→</span>
                For PDF problems, mention which form (G702, lien waiver, etc.).
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex-none text-teal">→</span>
                Screenshots help us resolve issues faster.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
