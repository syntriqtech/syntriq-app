import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({ className = "", children, ...buttonProps }: ButtonProps) {
  return (
    <button
      className={`w-full rounded-lg bg-navy px-4 py-2.5 font-medium text-white transition-colors hover:bg-navy/90 focus:outline-none focus:ring-2 focus:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-navy ${className}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
