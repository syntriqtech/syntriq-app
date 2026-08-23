// Shared by both /api/invitations (new invite) and /api/invitations/[id]/resend
// (same email, resent) so the copy only lives in one place.

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager",
  project_accountant: "Project Accountant",
};

export function buildInviteEmail(opts: {
  inviterName: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
}) {
  const roleLabel = ROLE_LABELS[opts.role] || opts.role;

  const subject = `${opts.inviterName} invited you to join ${opts.organizationName} on Syntriq`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; color: #16384A;">
      <h2 style="margin: 0 0 16px;">You're invited to Syntriq</h2>
      <p style="margin: 0 0 16px; line-height: 1.5;">
        <strong>${opts.inviterName}</strong> invited you to join
        <strong>${opts.organizationName}</strong> on Syntriq as a
        <strong>${roleLabel}</strong>.
      </p>
      <p style="margin: 0 0 24px; line-height: 1.5;">
        Syntriq turns billing into finished pay applications and lien waivers —
        click below to create your account (or log in, if you already have one)
        and join the team.
      </p>
      <a href="${opts.acceptUrl}"
         style="display: inline-block; background: #2C9AA6; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 8px; font-weight: 600;">
        Accept invite
      </a>
      <p style="margin: 24px 0 0; font-size: 13px; color: #667085;">
        This link expires in 7 days. If you weren't expecting this, you can ignore this email.
      </p>
    </div>
  `;

  return { subject, html };
}
