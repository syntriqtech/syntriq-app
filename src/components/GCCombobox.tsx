"use client";

import { useEffect, useRef, useState } from "react";
import { GeneralContractor, NewGeneralContractor } from "@/lib/generalContractorsDb";

type GCComboboxProps = {
  id?: string;
  label?: string;
  gcs: GeneralContractor[];
  query: string;
  selectedId: string | null;
  onQueryChange: (text: string) => void;
  onSelect: (gc: GeneralContractor) => void;
  onCreate: (input: NewGeneralContractor) => Promise<GeneralContractor>;
  required?: boolean;
  placeholder?: string;
};

const MAX_RESULTS = 20;

export default function GCCombobox({
  id = "gc-combobox",
  label = "Customer (GC) *",
  gcs,
  query,
  selectedId,
  onQueryChange,
  onSelect,
  onCreate,
  required,
  placeholder,
}: GCComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createPaymentTerms, setCreatePaymentTerms] = useState("");
  const [createRetention, setCreateRetention] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? gcs.filter((gc) => gc.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : gcs;
  const results = filtered.slice(0, MAX_RESULTS);

  function openCreateForm() {
    setCreateName(trimmedQuery);
    setCreateAddress("");
    setCreatePaymentTerms("");
    setCreateRetention("");
    setCreateError(null);
    setShowCreateForm(true);
  }

  function handlePick(gc: GeneralContractor) {
    onSelect(gc);
    setIsOpen(false);
    setShowCreateForm(false);
  }

  async function handleCreateSubmit() {
    if (!createName.trim()) {
      setCreateError("GC name is required.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const gc = await onCreate({
        name: createName,
        billingAddress: createAddress,
        paymentTerms: createPaymentTerms,
        defaultRetentionPct: createRetention.trim() !== "" ? Number(createRetention) : null,
      });
      onSelect(gc);
      setIsOpen(false);
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create GC.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-navy">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        required={required}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setIsOpen(true);
          setShowCreateForm(false);
        }}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
      />

      {selectedId ? (
        <p className="text-xs font-medium text-teal">✓ Linked to saved GC record</p>
      ) : trimmedQuery ? (
        <p className="text-xs font-medium text-amber-600">
          Select an existing GC below or add it as new.
        </p>
      ) : null}

      {isOpen && (
        <div className="absolute top-full z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {!showCreateForm ? (
            <>
              <div className="max-h-56 overflow-y-auto py-1">
                {results.length === 0 && (
                  <p className="px-4 py-2.5 text-sm text-gray-400">No matching GCs.</p>
                )}
                {results.map((gc) => (
                  <button
                    key={gc.id}
                    type="button"
                    onClick={() => handlePick(gc)}
                    className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-teal/5"
                  >
                    <span className="text-sm font-medium text-navy">{gc.name}</span>
                    {gc.billingAddress && (
                      <span className="text-xs text-gray-400">{gc.billingAddress}</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={openCreateForm}
                className="w-full border-t border-gray-100 px-4 py-2.5 text-left text-sm font-semibold text-teal hover:bg-teal/5"
              >
                + Add new GC{trimmedQuery ? ` "${trimmedQuery}"` : ""}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-navy">Add new GC</p>
              <input
                type="text"
                placeholder="GC name *"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <input
                type="text"
                placeholder="Billing address (optional)"
                value={createAddress}
                onChange={(e) => setCreateAddress(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <input
                type="text"
                placeholder="Payment terms (optional, e.g. Net 30)"
                value={createPaymentTerms}
                onChange={(e) => setCreatePaymentTerms(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Default retention % (optional)"
                value={createRetention}
                onChange={(e) => setCreateRetention(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={isCreating}
                  className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {isCreating ? "Creating…" : "Create GC"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isCreating}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
