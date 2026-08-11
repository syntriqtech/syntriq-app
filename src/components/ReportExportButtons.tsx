"use client";

export default function ReportExportButtons({
  onExportCsv,
  onExportPdf,
  disabled,
}: {
  onExportCsv: () => void;
  onExportPdf: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onExportCsv}
        disabled={disabled}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={onExportPdf}
        disabled={disabled}
        className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
      >
        Export PDF
      </button>
    </div>
  );
}
