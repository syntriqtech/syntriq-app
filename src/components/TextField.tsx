"use client";

import { InputHTMLAttributes, useState } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  prefix?: string;
  /** Highlights the field (amber border/background) — e.g. to flag a value that wasn't found by extraction and needs manual entry. */
  highlight?: boolean;
  /** Shows a red border and this message below the field. */
  error?: string;
};

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.4 21.4 0 0 1 5.06-6.06M9.9 4.24A10.8 10.8 0 0 1 12 4c7 0 11 8 11 8a21.4 21.4 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export default function TextField({ label, id, prefix, highlight, error, type, ...inputProps }: TextFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  const wrapperClass = error
    ? "flex items-center rounded-lg border border-red-300 bg-white focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200"
    : highlight
    ? "flex items-center rounded-lg border border-amber-300 bg-amber-50 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-200"
    : "flex items-center rounded-lg border border-gray-200 bg-white focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/30";
  const inputClass = error
    ? "w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
    : highlight
    ? "w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
    : "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-navy">
        {label}
      </label>
      {prefix ? (
        <div className={wrapperClass}>
          <span className="select-none pl-4 pr-1 text-navy">{prefix}</span>
          <input
            id={id}
            type={type}
            className="min-w-0 flex-1 bg-transparent py-2.5 pr-4 text-navy placeholder:text-gray-400 focus:outline-none"
            {...inputProps}
          />
        </div>
      ) : isPassword ? (
        <div className={wrapperClass}>
          <input
            id={id}
            type={showPassword ? "text" : "password"}
            className="min-w-0 flex-1 rounded-lg bg-transparent py-2.5 pl-4 pr-2 text-navy placeholder:text-gray-400 focus:outline-none"
            {...inputProps}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="flex shrink-0 items-center px-3 text-gray-400 hover:text-navy"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
      ) : (
        <input id={id} type={type} className={inputClass} {...inputProps} />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
