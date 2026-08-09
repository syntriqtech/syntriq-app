import { Project } from "@/lib/mockData";

const STATUS_STYLES: Record<Project["status"], string> = {
  Active: "bg-[#E4F4EE] text-[#15795A]",
  "On Hold": "bg-[#FBEFD2] text-[#956512]",
  Closed: "bg-[#EEF1F3] text-[#6E7E89]",
};

const STATUS_LABEL: Record<Project["status"], string> = {
  Active: "Active",
  "On Hold": "On hold",
  Closed: "Closed",
};

export default function StatusBadge({ status }: { status: Project["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
