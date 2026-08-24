import Image from "next/image";
import Link from "next/link";
import { TERMS_LAST_UPDATED } from "@/lib/terms";

export const metadata = {
  title: "Terms of Service — Syntriq",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/SyntriqLogo2.png" alt="Syntriq" width={64} height={64} />
          <h1 className="mt-2 text-2xl font-semibold text-navy">Terms of Service</h1>
          <p className="text-sm text-gray-400">Last updated: {TERMS_LAST_UPDATED}</p>
        </div>

        <div className="mt-8 space-y-4 text-sm leading-relaxed text-gray-600">
          <p>
            Placeholder — replace this section with the actual Terms of Service text. The route,
            page, and signup checkbox are wired up; drop the final legal copy in here when it&apos;s
            ready.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-teal hover:underline">
            Back to Syntriq
          </Link>
        </div>
      </div>
    </main>
  );
}
