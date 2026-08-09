import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { name, email, company, category, subject, message } = await req.json();

    if (!message || message.trim().length < 10) {
      return NextResponse.json({ error: "Message is too short." }, { status: 400 });
    }

    const { error } = await resend.emails.send({
      from: "Syntriq Support <onboarding@resend.dev>",
      to: "syntriqtech@gmail.com",
      replyTo: email || "noreply@syntriq.com",
      subject: `[Support] ${category}: ${subject || "(no subject)"}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; color: #0f334b;">
          <h2 style="margin: 0 0 16px;">New Support Request</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; white-space: nowrap;">Name</td><td style="padding: 6px 0;">${name || "—"}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; white-space: nowrap;">Email</td><td style="padding: 6px 0;">${email || "—"}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; white-space: nowrap;">Company</td><td style="padding: 6px 0;">${company || "—"}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; white-space: nowrap;">Category</td><td style="padding: 6px 0;">${category}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; white-space: nowrap;">Subject</td><td style="padding: 6px 0;">${subject || "—"}</td></tr>
          </table>
          <h3 style="margin: 0 0 8px;">Message</h3>
          <div style="background: #f9fafb; border-left: 3px solid #1d8f96; padding: 14px 16px; border-radius: 4px; white-space: pre-wrap;">${message}</div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Support route error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
