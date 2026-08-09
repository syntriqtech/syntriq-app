"use client";

import { useEffect } from "react";

type Props = {
  onYes: () => void;
  onClose: () => void;
};

export default function JobCreatedModal({ onYes, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-navy">Job Created</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <p className="text-sm text-gray-600">
            Would you like to edit the Schedule of Values for this job now?
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={onYes}
              className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
            >
              Yes, edit SOV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
