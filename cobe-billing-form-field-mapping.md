# COBE Construction — Billing Form Field Mapping (Custom Billing Forms feature)

Source file: `COBE_Subcontract_Template_USE THIS.pdf` (COBE's subcontract template, provided by
Jason 2026-09-27) — only pages 16–17 matter, COBE's "EXPRESS Pay Application" Progress and Final
forms. The rest of the 19-page subcontract was discarded before upload.

## Structure

Unlike CTI's Excel workbook, COBE's form is a real fillable PDF (an AcroForm) with a Civil Code
lien waiver built into the bottom half of each page — one page for Progress payments
(§8132 conditional waiver), one for Final payment (§8136 conditional waiver). COBE built the
Final page by copy-pasting Progress, so 14 fields ended up with the *exact same* `/T` name on
both pages (no `/Parent`/`Kids` relationship — just a literal name collision): `From`, `To`,
`Invoice #`, `$389,270.00`, the 5 Change Order contracted-amount fields, `Payment`,
`Net Total To Be Paid`, `Amount of Check: $`, `Claimant's Signature`, and `Claimant's Title`.
This mattered more than it first looked like it would: compliant PDF viewers (pdfium, Acrobat,
Chrome's built-in viewer) treat same-named fields across a document as one logical field and
synchronize their value/appearance, so filling in the Final page's copy while the Progress page's
copy sat blank made viewers display the *Progress* page's blank state instead of what was actually
written — Final looked completely unfilled even though the bytes were correct. The fix lives in
`scripts/setup-cobe-billing-template.mjs`: every colliding field on the Final page gets renamed
with a " p17" suffix (matching the suffix convention COBE's own non-colliding fields already use)
at template-build time, so the stored template has zero name collisions to begin with — see
`RENAME_ON_FINAL` there for the exact list, and the Final field_mapping below for the resulting
names.

Separately, `src/lib/billingPdfFill.ts`'s fill engine writes to every field by looking up its
widget directly on the target page (`findWidgetByName`) rather than through pdf-lib's
`form.getTextField(name)` — that API resolves a name to whichever matching field comes first in
the document regardless of page, which is exactly the bug above; page-scoped lookup keeps working
correctly even if a future template edit reintroduces a collision. It also explicitly calls
`form.markFieldAsDirty()` after every raw `/V` write, since some of COBE's fields ship with a
baked (blank) appearance stream and pdf-lib only regenerates a field's appearance at save time if
it's marked dirty — without this, a field with a pre-existing blank appearance kept showing blank
despite its `/V` being set correctly underneath.

The stored template file (in the `billing-form-templates` bucket) is the same 2-page PDF for both
library rows — "COBE — Progress Payment" fills page 0, "COBE — Final Payment" fills page 1, per
each row's `field_mapping.page`. Its path is versioned (`{orgId}/cobe-billing-form-v2.pdf`, bumped
from an earlier `-v1`) — re-uploading to a fixed path with `upsert` doesn't reliably bust
Supabase's/Cloudflare's edge cache for every viewer (observed stale downloads served well after a
confirmed-fresh upload, on a delay that varied by request origin); a new path has nothing to be
stale. Bump the version suffix again if the template file ever needs to change.

## Filled fields (Progress page)

| PDF field name | Syntriq source |
|---|---|
| From / To | "Application date" input / "Period to" input |
| Invoice # | `{jobNumber}-{applicationNumber}` |
| COBE Project p16 / PO# p16 | Job name / PO number |
| Subcontractor p16 | Company name |
| Accounting Contact p16 / Email p16 / Phone p16 | Company profile contact name/email/phone |
| Base Contracted Amount p16 | `job.contractValue` (the job's original contract amount) |
| $389,270.00 *(field's literal name — a leftover from whoever built the template; its value was always blank)* | Base Requested Payment = sum of this period's contract-line billing (`lineItems`, excluding change orders) |
| Change Order #1–#4 / Payment, Text61, Text63, Text65 | Contracted/Requested pairs for the first 4 change orders (`changeOrders[0..3]`: `scheduledValue` / `thisPeriod`) |
| Change Order #_ / Text67 | Any 5th+ change order, summed together into this one catch-all row |
| Subtotal | Sum of all Requested Payment cells above |
| 10% Retention | `job.retentionRateCW% × Subtotal` — **write the plain positive amount**, the form pre-prints the minus sign next to the box |
| Net Total To Be Paid | Subtotal − Retention |
| Amount of Check: $ / Check Payable to | Net Total To Be Paid / Company name |
| Name of Claimant p16 / Name of Customer p16 | Company name / `job.customer` (COBE) |
| Job Location p16 / Owner p16 / Through Date p16 | `job.jobAddress` / `job.owner` / Period To |
| Claimant's Signature | **Not a text field — a real AcroForm `/Sig` field.** pdf-lib can't fill those, so it's removed from the page and the adopted signature image is drawn on top instead (see `removeWidgetByFieldName` in billingPdfFill.ts) — otherwise unsigned `/Sig` fields render a "click to sign" tag in most viewers. |
| Claimant's Title / Date of Signature p16 | Signer title / signature date |
| Dates of waiver and release / Amount(s) of unpaid progress payment(s) p16 | Left blank — same default as the existing lien waiver flow |

## Final page differences

- No Subtotal/Retention row — Net Total To Be Paid is the full requested amount (retention is
  assumed already released by the time a Final is billed).
- Field names swap the `p16` suffix for `p17` (`COBE Project p17`, `Owner p17`, etc.) — these
  never collided with Progress to begin with.
- The 14 fields that *did* collide with Progress (see above) are addressed on Final with an
  explicit " p17" suffix appended to their original name: `From p17`, `To p17`, `Invoice # p17`,
  `$389,270.00 p17`, `Change Order #1 p17` … `Change Order # p17`, `Payment p17`,
  `Net Total To Be Paid p17`, `Amount of Check: $ p17`, `Claimant's Signature p17`,
  `Claimant's Title p17`.
- Change order requested-payment fields are `Payment p17, Text84, Text86, Text88, Text90` instead
  of `Payment, Text61, Text63, Text65, Text67` (only the first, `Payment`, collided).

## Decisions

- **Retention rate**: uses the job's real `retentionRateCW`, not a hardcoded 10%, even though the
  form's own label says "10% Retention" — Jason's call, so a job with a non-10% rate still comes
  out correct even though the printed label doesn't update.
- **Change orders**: sourced from the SOV's `changeOrders` line items (the same array already
  loaded on the Download Package page), not the separate `change_orders` approval-workflow table
  — consistent with how CTI's own mapping treats change orders as SOV lines.
- **Signatures**: wired to Syntriq's existing adopted-signature feature (same signature already
  used for the default lien waivers), rather than left blank for print-and-sign.
- General note from the CTI mapping doc applies here too: COBE's own form is "wonky" in a few
  places (e.g. that stray `$389,270.00` field name) — nothing to fix on Syntriq's end, just fill
  the fields that matter correctly.

## Status

Built and provisioned end-to-end 2026-09-27 for both the California Tile Installers org
(32ab6164…) and the Goyard Concrete org (8cd53613…): template trimmed, Final-page collisions
renamed, uploaded to a versioned path, both library rows updated (enabled), and verified against
rendered output (pdfium) and a real live download through the running app for both orgs — Base
Contracted Amount alignment, uniform currency font sizing, and (after the collision fix) every
Final-page field actually filling in were all specifically re-checked live, not just in isolated
scripts. Ready to use from Download Package → "Billing form" ▸ COBE — Progress Payment /
COBE — Final Payment.
