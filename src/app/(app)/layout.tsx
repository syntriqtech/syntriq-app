import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      <Sidebar />
      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}
