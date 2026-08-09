"use client";

import { useRef, useState } from "react";
import { SOVLineItem } from "@/lib/sovData";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type EditableField =
  | "description"
  | "scheduledValue"
  | "previousApplications"
  | "thisPeriod"
  | "storedMaterials"
  | "percentComplete";

// ── Shared input base ─────────────────────────────────────────────────────────

function borderClass(isOver?: boolean) {
  return isOver
    ? "border border-red-300 focus:border-red-400 focus:ring-red-200"
    : "border border-gray-200 focus:border-teal focus:ring-teal/30";
}

const INPUT_BASE =
  "w-full rounded-md bg-white px-2 py-1.5 text-right text-sm text-navy focus:outline-none focus:ring-2";

// ── CurrencyInput ─────────────────────────────────────────────────────────────
// Shows formatted $X,XXX.XX at rest; shows raw number while the user is typing.

function CurrencyInput({
  value,
  onCommit,
  isOver,
}: {
  value: number;
  onCommit: (v: string) => void;
  isOver?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      className={`${INPUT_BASE} ${borderClass(isOver)}`}
      value={draft !== null ? draft : currency.format(value)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setDraft(value === 0 ? "" : String(value));
        requestAnimationFrame(() => ref.current?.select());
      }}
      onBlur={(e) => {
        // strip $, commas, spaces before committing so Number() parses cleanly
        const cleaned = e.target.value.replace(/[$,\s]/g, "");
        onCommit(cleaned);
        setDraft(null);
      }}
    />
  );
}

// ── PercentInput ──────────────────────────────────────────────────────────────

function PercentInput({
  value,
  onCommit,
  isOver,
}: {
  value: number;
  onCommit: (v: string) => void;
  isOver?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      min="0"
      max="100"
      step="0.1"
      className={`${INPUT_BASE} ${borderClass(isOver)}`}
      value={draft ?? value.toFixed(1)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(value.toFixed(1));
        e.target.select();
      }}
      onBlur={(e) => {
        onCommit(e.target.value);
        setDraft(null);
      }}
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}

// ── SOVTable ──────────────────────────────────────────────────────────────────

export default function SOVTable({
  title,
  itemLabel,
  addButtonLabel,
  items,
  cwRate,
  smRate,
  onUpdateItem,
  onAddItem,
  lockDefinition,
  readOnly,
}: {
  title: string;
  itemLabel: string;
  addButtonLabel?: string;
  items: SOVLineItem[];
  cwRate: number;
  smRate: number;
  onUpdateItem: (index: number, field: EditableField, value: string) => void;
  onAddItem?: () => void;
  lockDefinition?: boolean;
  readOnly?: boolean;
}) {
  const rows = items.map((line) => {
    const totalCompleted =
      line.previousApplications + line.thisPeriod + line.storedMaterials;
    const percentComplete =
      line.scheduledValue !== 0
        ? (totalCompleted / line.scheduledValue) * 100
        : 0;
    const balanceToFinish = line.scheduledValue - totalCompleted;
    const retention =
      cwRate * (line.previousApplications + line.thisPeriod) +
      smRate * line.storedMaterials;
    const isOver =
      line.scheduledValue >= 0 && totalCompleted > line.scheduledValue;
    return {
      ...line,
      totalCompleted,
      percentComplete,
      balanceToFinish,
      retention,
      isOver,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      scheduledValue: acc.scheduledValue + row.scheduledValue,
      previousApplications:
        acc.previousApplications + row.previousApplications,
      thisPeriod: acc.thisPeriod + row.thisPeriod,
      storedMaterials: acc.storedMaterials + row.storedMaterials,
      totalCompleted: acc.totalCompleted + row.totalCompleted,
      balanceToFinish: acc.balanceToFinish + row.balanceToFinish,
      retention: acc.retention + row.retention,
    }),
    {
      scheduledValue: 0,
      previousApplications: 0,
      thisPeriod: 0,
      storedMaterials: 0,
      totalCompleted: 0,
      balanceToFinish: 0,
      retention: 0,
    }
  );
  const totalPct =
    totals.scheduledValue !== 0
      ? (totals.totalCompleted / totals.scheduledValue) * 100
      : 0;

  // Computed-cell class — consistent plain style, right-aligned, no border.
  const computed = "px-3 py-2 text-right text-sm font-medium text-navy";
  const computedOver =
    "px-3 py-2 text-right text-sm font-medium text-red-600";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-navy">{title}</h2>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium">
                {itemLabel}
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium">
                Description
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Scheduled Value
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Previous Applications
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                This Period
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Stored Materials
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Total Completed
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                % Complete
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Balance to Finish
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                Retention
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-4 text-center text-gray-400"
                >
                  None yet
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr
                key={index}
                className={row.isOver ? "bg-red-50" : undefined}
              >
                {/* Item # */}
                <td className="px-3 py-2 font-semibold text-navy">
                  {row.item}
                </td>

                {/* Description — locked for change orders */}
                <td className="px-3 py-2">
                  {lockDefinition || readOnly ? (
                    <span className="text-sm text-navy">{row.description || "—"}</span>
                  ) : (
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                      value={row.description}
                      onChange={(e) =>
                        onUpdateItem(index, "description", e.target.value)
                      }
                      onFocus={(e) => e.target.select()}
                    />
                  )}
                </td>

                {/* Scheduled Value — locked for change orders */}
                <td className="px-3 py-2">
                  {lockDefinition || readOnly ? (
                    <span className="block text-right text-sm font-medium text-navy">{currency.format(row.scheduledValue)}</span>
                  ) : (
                    <CurrencyInput
                      value={row.scheduledValue}
                      onCommit={(v) =>
                        onUpdateItem(index, "scheduledValue", v)
                      }
                    />
                  )}
                </td>

                {/* Previous Applications */}
                <td className={readOnly ? computed : "px-3 py-2"}>
                  {readOnly ? (
                    currency.format(row.previousApplications)
                  ) : (
                    <CurrencyInput
                      value={row.previousApplications}
                      onCommit={(v) =>
                        onUpdateItem(index, "previousApplications", v)
                      }
                      isOver={row.isOver}
                    />
                  )}
                </td>

                {/* This Period */}
                <td className={readOnly ? computed : "px-3 py-2"}>
                  {readOnly ? (
                    currency.format(row.thisPeriod)
                  ) : (
                    <CurrencyInput
                      value={row.thisPeriod}
                      onCommit={(v) => onUpdateItem(index, "thisPeriod", v)}
                      isOver={row.isOver}
                    />
                  )}
                </td>

                {/* Stored Materials */}
                <td className={readOnly ? computed : "px-3 py-2"}>
                  {readOnly ? (
                    currency.format(row.storedMaterials)
                  ) : (
                    <CurrencyInput
                      value={row.storedMaterials}
                      onCommit={(v) =>
                        onUpdateItem(index, "storedMaterials", v)
                      }
                      isOver={row.isOver}
                    />
                  )}
                </td>

                {/* Total Completed — computed */}
                <td className={row.isOver ? computedOver : computed}>
                  {currency.format(row.totalCompleted)}
                </td>

                {/* % Complete */}
                <td className={readOnly ? computed : "px-3 py-2"}>
                  {readOnly ? (
                    `${row.percentComplete.toFixed(1)}%`
                  ) : (
                    <PercentInput
                      value={row.percentComplete}
                      onCommit={(v) =>
                        onUpdateItem(index, "percentComplete", v)
                      }
                      isOver={row.isOver}
                    />
                  )}
                </td>

                {/* Balance to Finish — computed */}
                <td className={computed}>
                  {currency.format(row.balanceToFinish)}
                </td>

                {/* Retention — computed */}
                <td className={computed}>{currency.format(row.retention)}</td>
              </tr>
            ))}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-bold text-navy">
                <td className="px-3 py-3" colSpan={2}>
                  Totals
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.scheduledValue)}
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.previousApplications)}
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.thisPeriod)}
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.storedMaterials)}
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.totalCompleted)}
                </td>
                <td className="px-3 py-3 text-right">
                  {totalPct.toFixed(1)}%
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.balanceToFinish)}
                </td>
                <td className="px-3 py-3 text-right">
                  {currency.format(totals.retention)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {onAddItem && (
        <button
          type="button"
          onClick={onAddItem}
          className="w-fit rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
        >
          {addButtonLabel}
        </button>
      )}
    </div>
  );
}
