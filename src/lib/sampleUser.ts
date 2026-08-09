import { createClient } from "@/lib/supabase/client";

const DEFAULT_USER = {
  name: "Jason Blancaflor",
  email: "jason@caltileinstallers.com",
  company: "California Tile Installers",
  companyAddress: "4820 Harbor Industrial Way, Long Beach, CA 90802",
  initials: "JB",
};

export const sampleUser = DEFAULT_USER;

export async function getContractorInfo() {
  try {
    const supabase = createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) return DEFAULT_USER;

    const { data, error } = await supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", userData.user.id)
      .single();

    if (error || !data) return DEFAULT_USER;

    return {
      name: data.contact_name,
      email: data.contact_email,
      company: data.company_name,
      companyAddress: data.company_address,
      initials: data.contact_name
        .split(" ")
        .map((word: string) => word[0])
        .join("")
        .toUpperCase(),
    };
  } catch {
    return DEFAULT_USER;
  }
}
