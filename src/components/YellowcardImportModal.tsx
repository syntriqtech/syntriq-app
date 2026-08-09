"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  onClose: () => void;
  isImporting: boolean;
};

export default function YellowcardImportModal({ onFile, onClose, isImporting }: Props) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isImporting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isImporting]);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={isImporting ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy">Job Import</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Upload the job&apos;s billing workbook to pre-fill this form.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="mt-0.5 flex-none text-xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <div
            onClick={() => !isImporting && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isImporting) setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragActive(false);
              if (!isImporting) handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              isImporting
                ? "cursor-default border-gray-200"
                : isDragActive
                ? "cursor-pointer border-teal bg-teal/5"
                : "cursor-pointer border-gray-200 hover:border-teal/50 hover:bg-gray-50"
            }`}
          >
            {isImporting ? (
              <>
                <svg
                  className="h-8 w-8 animate-spin text-teal"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <p className="text-sm font-semibold text-navy">Reading file…</p>
              </>
            ) : (
              <>
                <svg
                  className="h-8 w-8 text-teal"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 16V4m0 0L7 9m5-5l5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20 16v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-sm font-semibold text-navy">Drag & drop your file here</p>
                <p className="text-sm text-gray-500">
                  or <span className="font-semibold text-teal">browse</span> to choose a file
                </p>
                <p className="text-xs text-gray-400">.xlsx only</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
