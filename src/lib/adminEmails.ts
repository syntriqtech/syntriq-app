// Platform-level admin access (the Syntriq admin page, which can see every
// customer's account) — separate from the per-organization "owner" role,
// which only grants visibility into that one company. Add an email here to
// grant it access.
export const ADMIN_EMAILS = ["syntriqtech@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
