import { fetchCompanyProfile } from "@/lib/companyProfileDb";

const DEFAULT_USER = {
  name: "Jane Doe",
  email: "jane@legacyconstruction.com",
  company: "Legacy Construction",
  companyAddress: "4820 Harbor Industrial Way, Long Beach, CA 90802",
  initials: "JD",
};

export const sampleUser = DEFAULT_USER;

// Delegates to fetchCompanyProfile() (org-scoped, supabase/060) rather than
// querying company_profile directly — this used to run its own per-user
// query here, which is exactly the bug that made a teammate with no
// personal profile row silently fall back to this placeholder instead of
// the company's real, shared profile.
export async function getContractorInfo() {
  try {
    const profile = await fetchCompanyProfile();
    if (!profile) return DEFAULT_USER;

    return {
      name: profile.contactName,
      email: profile.contactEmail,
      company: profile.companyName,
      companyAddress: profile.companyAddress,
      initials: profile.contactName
        .split(" ")
        .map((word: string) => word[0])
        .join("")
        .toUpperCase(),
    };
  } catch {
    return DEFAULT_USER;
  }
}
