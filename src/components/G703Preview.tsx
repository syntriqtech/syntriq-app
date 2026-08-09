import { SOVLineItem } from "@/lib/sovData";
import SOVTable from "@/components/SOVTable";

type G703PreviewProps = {
  lineItems: SOVLineItem[];
  changeOrders: SOVLineItem[];
  cwRate: number;
  smRate: number;
};

export default function G703Preview({
  lineItems,
  changeOrders,
  cwRate,
  smRate,
}: G703PreviewProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <h3 className="text-base font-bold text-navy mb-6">G703 — Continuation Sheet / Schedule of Values</h3>

      <SOVTable
        title="Contract line items"
        itemLabel="Item"
        items={lineItems}
        cwRate={cwRate}
        smRate={smRate}
        onUpdateItem={() => {}}
        readOnly
      />

      {changeOrders.length > 0 && (
        <div className="mt-6">
          <SOVTable
            title="Change orders"
            itemLabel="CO #"
            items={changeOrders}
            cwRate={cwRate}
            smRate={smRate}
            onUpdateItem={() => {}}
          />
        </div>
      )}
    </div>
  );
}
