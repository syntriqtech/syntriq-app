import { createClient } from "@/lib/supabase/client";
import { fetchCompanyProfile } from "@/lib/companyProfileDb";
import { fetchUserProfile } from "@/lib/userProfileDb";

const DEFAULT_USER = {
  name: "Jane Doe",
  email: "jane@legacyconstruction.com",
  company: "Legacy Construction",
  companyAddress: "4820 Harbor Industrial Way, Long Beach, CA 90802",
  initials: "JD",
};

export const sampleUser = DEFAULT_USER;

// name/email/initials are the signed-in INDIVIDUAL's own identity
// (user_profiles + their real login email) — company/companyAddress are
// the shared, org-wide identity (company_profile). Mixing these up is
// exactly the bug found live: this function used to source name/email
// from company_profile too, which is one shared row per org (owner-only,
// supabase/060) — every teammate's sidebar chip showed the OWNER's own
// contact info instead of their own, since it's now the same row for
// everyone in the org.
export async function getContractorInfo() {
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const authEmail = userData.user?.email ?? "";

    const [userProfile, companyProfile] = await Promise.all([
      fetchUserProfile().catch(() => null),
      fetchCompanyProfile().catch(() => null),
    ]);

    const name = userProfile?.fullName || DEFAULT_USER.name;
    const email = authEmail || userProfile?.email || DEFAULT_USER.email;

    return {
      name,
      email,
      company: companyProfile?.companyName || DEFAULT_USER.company,
      companyAddress: companyProfile?.companyAddress || DEFAULT_USER.companyAddress,
      initials:
        name
          .split(" ")
          .map((word: string) => word[0])
          .join("")
          .toUpperCase() || DEFAULT_USER.initials,
    };
  } catch {
    return DEFAULT_USER;
  }
}
