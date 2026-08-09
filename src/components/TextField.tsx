import { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  prefix?: string;
  /** Highlights the field (amber border/background) — e.g. to flag a value that wasn't found by extraction and needs manual entry. */
  highlight?: boolean;
};

export default function TextField({ label, id, prefix, highlight, ...inputProps }: TextFieldProps) {
  const wrapperClass = highlight
    ? "flex items-center rounded-lg border border-amber-300 bg-amber-50 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-200"
    : "flex items-center rounded-lg border border-gray-200 bg-white focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/30";
  const inputClass = highlight
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
            className="min-w-0 flex-1 bg-transparent py-2.5 pr-4 text-navy placeholder:text-gray-400 focus:outline-none"
            {...inputProps}
          />
        </div>
      ) : (
        <input id={id} className={inputClass} {...inputProps} />
      )}
    </div>
  );
}
