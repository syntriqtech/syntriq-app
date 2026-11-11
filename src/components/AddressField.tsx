"use client";

import { useEffect, useRef, useState } from "react";
import TextField, { TextFieldProps } from "@/components/TextField";

type AddressFieldProps = Omit<TextFieldProps, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
const MIN_CHARS = 4;

function newSessionToken() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

/**
 * A text field that suggests real addresses (Google Places) as you type.
 * Pick a suggestion to fill the field. If no Google key is set up, or the
 * lookup fails, it behaves exactly like a normal text field.
 */
export default function AddressField({ value, onValueChange, ...fieldProps }: AddressFieldProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const sessionToken = useRef(newSessionToken());
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (!API_KEY) return;
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
          },
          body: JSON.stringify({
            input: query,
            sessionToken: sessionToken.current,
            includedRegionCodes: ["us"],
          }),
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        const items: string[] = (data.suggestions ?? [])
          .map((s: { placePrediction?: { text?: { text?: string } } }) => s.placePrediction?.text?.text)
          .filter((t: string | undefined): t is string => !!t)
          .map((t: string) => t.replace(/,\s*USA$/, ""));
        setSuggestions(items);
        setActive(-1);
      } catch {
        // Aborted or offline — just show no suggestions.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function choose(text: string) {
    skipNextLookup.current = true;
    onValueChange(text);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    sessionToken.current = newSessionToken(); // a pick ends the lookup "session"
  }

  if (!API_KEY) {
    return <TextField {...fieldProps} value={value} onChange={(e) => onValueChange(e.target.value)} />;
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <TextField
        {...fieldProps}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault(); // pick the suggestion instead of submitting the form
            choose(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              // mouseDown (not click) so it fires before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2 text-sm text-navy ${i === active ? "bg-teal/10" : ""}`}
            >
              {s}
            </li>
          ))}
          <li className="px-4 pb-1 pt-0.5 text-right text-[10px] text-gray-400">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}
