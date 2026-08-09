"use client";

import { useEffect, useRef, useState } from "react";
import { DbJob } from "@/lib/jobs";
import { createChangeOrder, fetchNextCoNumber, uploadCoDocument, ChangeOrder } from "@/lib/changeOrdersDb";

type Props = {
  jobs: DbJob[];
  defaultJobId?: string;
  onClose: () => void;
  onCreated: (co: ChangeOrder) => void;
};

export default function ChangeOrderQuickAdd({ jobs, defaultJobId, onClose, onCreated }: Props) {
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.jobNumber.localeCompare(b.jobNumber);
  });
  const [jobId, setJobId] = useState(defaultJobId ?? sortedJobs[0]?.id ?? "");
  const [previewCoNumber, setPreviewCoNumber] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) { setPreviewCoNumber(null); return; }
    let cancelled = false;
    fetchNextCoNumber(jobId).then((n) => { if (!cancelled) setPreviewCoNumber(n); });
    return () => { cancelled = true; };
  }, [jobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobId) { setError("Select a job."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    const parsedAmount = parseFloat(amount.replace(/[^0-9.\-]/g, ""));
    if (isNaN(parsedAmount)) { setError("Enter a valid amount (can be negative for deducts)."); return; }

    setSaving(true);
    try {
      const co = await createChangeOrder({ jobId, description: description.trim(), amount: parsedAmount });

      if (file) {
        try {
          const url = await uploadCoDocument(co.id, file);
          await import("@/lib/changeOrdersDb").then(({ updateChangeOrder }) =>
            updateChangeOrder(co.id, { approvalDocUrl: url })
          );
          onCreated({ ...co, approvalDocUrl: url });
        } catch {
          // Upload failed — CO saved without doc, still succeed
          onCreated(co);
        }
      } else {
        onCreated(co);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy">New Change Order</h2>
            {previewCoNumber && (
              <p className="mt-0.5 text-sm text-gray-500">
                This will be CO <span className="font-mono font-semibold text-teal">#{previewCoNumber}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Job</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            >
              {sortedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobName || `⚠ No name (${j.jobNumber})`}{j.jobName ? ` (${j.jobNumber})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this change order cover?"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal resize-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount <span className="text-gray-400 font-normal">(negative for deducts)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0.00"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Approval doc <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:border-teal hover:text-teal transition-colors"
            >
              <span className="text-base">📎</span>
              {file ? file.name : "Click to attach a file or photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.heic"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add CO"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
