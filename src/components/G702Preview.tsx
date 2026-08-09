import { DbJob } from "@/lib/jobs";
import { SOVLineItem } from "@/lib/sovData";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type G702PreviewProps = {
  job: DbJob;
  applicationNumber: string;
  applicationDate: string;
  periodTo: string;
  lineItems: SOVLineItem[];
  changeOrders: SOVLineItem[];
  cwRate: number;
  smRate: number;
  totalCompleted: number;
  totalRetention: number;
  currentPaymentDue: number;
  contractorName: string;
  contractorAddress: string;
};

export default function G702Preview({
  job,
  applicationNumber,
  applicationDate,
  periodTo,
  lineItems,
  changeOrders,
  cwRate,
  smRate,
  totalCompleted,
  totalRetention,
  currentPaymentDue,
  contractorName,
  contractorAddress,
}: G702PreviewProps) {
  const netChangeOrders = changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const contractSumToDate = (job?.contractValue ?? 0) + netChangeOrders;
  const earnedLessRetainage = totalCompleted - totalRetention;
  const previousCertificates = earnedLessRetainage - currentPaymentDue;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <h3 className="text-base font-bold text-navy">G702 — Application for Payment</h3>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Contractor info */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-400">From Contractor</p>
          <p className="mt-2 text-sm font-medium text-navy">{contractorName}</p>
          <p className="mt-1 text-xs text-gray-600">{contractorAddress}</p>
        </div>

        {/* Project info */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-400">Project</p>
          <p className="mt-2 text-sm font-medium text-navy">{job.jobName || job.jobNumber}</p>
          <p className="mt-1 text-xs text-gray-600">{job.jobNumber} · {job.customer}</p>
        </div>

        {/* Application info */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-400">Application</p>
          <p className="mt-2 text-sm font-medium text-navy">#{applicationNumber}</p>
          <p className="mt-1 text-xs text-gray-600">{applicationDate}</p>
        </div>
      </div>

      {/* Summary table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="bg-gray-50 px-4 py-2 font-medium text-gray-600">Original Contract Sum</td>
              <td className="text-right px-4 py-2 font-medium text-navy">{currency.format(job.contractValue)}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-4 py-2 font-medium text-gray-600">Net Change by Change Orders</td>
              <td className="text-right px-4 py-2 font-medium text-navy">{currency.format(netChangeOrders)}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-4 py-2 font-bold text-navy">Contract Sum to Date</td>
              <td className="text-right px-4 py-2 font-bold text-navy">{currency.format(contractSumToDate)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium text-gray-600">Total Completed & Stored to Date</td>
              <td className="text-right px-4 py-2 font-medium text-navy">{currency.format(totalCompleted)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium text-gray-600">Retainage</td>
              <td className="text-right px-4 py-2 font-medium text-navy">{currency.format(totalRetention)}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-4 py-2 font-bold text-navy">Total Earned Less Retainage</td>
              <td className="text-right px-4 py-2 font-bold text-navy">{currency.format(earnedLessRetainage)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium text-gray-600">Less Previous Certificates for Payment</td>
              <td className="text-right px-4 py-2 font-medium text-navy">{currency.format(previousCertificates)}</td>
            </tr>
            <tr>
              <td className="bg-teal/10 px-4 py-3 font-bold text-navy">CURRENT PAYMENT DUE</td>
              <td className="text-right bg-teal/10 px-4 py-3 font-bold text-teal">{currency.format(currentPaymentDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
