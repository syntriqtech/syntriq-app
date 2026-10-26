"use client";

import { useEffect, useState } from "react";
import { fetchJobStoredMaterials, getStoredMaterialFileUrl, JobStoredMaterials } from "@/lib/storedMaterialsDb";
import { SECTION_LABELS } from "@/lib/storedMaterialsMath";

/** Read-only list of the stored-materials entries and documents saved under one pay application. */
export default function StoredMaterialsSummary({ jobId, payApplicationId }: { jobId: string; payApplicationId: string }) {
  const [data, setData] = useState<JobStoredMaterials | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJobStoredMaterials(jobId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [jobId, payApplicationId]);

  const entries = data?.entries.filter((e) => e.payApplicationId === payApplicationId) ?? [];
  if (!data || entries.length === 0) return null;

  async function open(path: string) {
    try {
      window.open(await getStoredMaterialFileUrl(path), "_blank", "noopener");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <h2 className="text-base font-bold text-navy">Stored Materials</h2>
      <ul className="mt-4 flex flex-col gap-4 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="rounded-xl border border-gray-100 p-3">
            <p className="font-medium text-navy">
              Item {e.sovItem}
              {e.description ? ` — ${e.description}` : ""}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {data.documents
                .filter((d) => d.entryId === e.id)
                .map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => open(d.filePath)} className="font-medium text-teal hover:underline">
                      {SECTION_LABELS[d.docType]}: {d.fileName}
                    </button>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
      {data.coi && (
        <p className="mt-3 text-xs text-gray-500">
          COI: <button type="button" onClick={() => open(data.coi!.filePath)} className="font-medium text-teal hover:underline">{data.coi.fileName}</button>
          {data.coi.coiExpirationDate ? ` · expires ${new Date(data.coi.coiExpirationDate + "T00:00:00").toLocaleDateString("en-US")}` : ""}
        </p>
      )}
    </div>
  );
}
