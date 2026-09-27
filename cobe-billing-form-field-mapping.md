# COBE Construction — Billing Form Field Mapping (Custom Billing Forms feature)

Source file: `COBE_Subcontract_Template_USE THIS.pdf` (COBE's subcontract template, provided by
Jason 2026-09-27) — only pages 16–17 matter, COBE's "EXPRESS Pay Application" Progress and Final
forms. The rest of the 19-page subcontract was discarded before upload.

## Structure

Unlike CTI's Excel workbook, COBE's form is a real fillable PDF (an AcroForm) with a Civil Code
lien waiver built into the bottom half of each page — one page for Progress payments
(§8132 conditional waiver), one for Final payment (§8136 conditional waiver). Both pages share
most of their field *names* (e.g. `Net Total To Be Paid`, `Change Order #1`, `Payment`) since
COBE built the Progress and Final pages off the same field set — this only matters because a
generation always fills and flattens one page at a time into its own output, so the shared names
never collide in practice. See `src/lib/billingPdfFill.ts` for the fill engine (parallel to
`billingWorkbookFill.ts`, which does the same job for CTI's Excel template) and
`scripts/setup-cobe-billing-template.mjs` for the one-off script that trimmed the source PDF to
just these two pages and uploaded it.

The stored template file (`{orgId}/cobe-billing-form.pdf` in the `billing-form-templates`
bucket) is the same 2-page PDF for both library rows — "COBE — Progress Payment" fills page 0,
"COBE — Final Payment" fills page 1, per each row's `field_mapping.page`.

## Filled fields (Progress page)

| PDF field name | Syntriq source |
|---|---|
| From / To | Previous application's Period To / this application's Period To |
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
- Field names swap the `p16` suffix for `p17` (`COBE Project p17`, `Owner p17`, etc.); the dollar
  fields (`Change Order #1`, `Payment`, `Net Total To Be Paid`, `Amount of Check: $`, …) are the
  same field names as the Progress page — see the note above on why that's fine.
- Change order requested-payment fields are `Payment, Text84, Text86, Text88, Text90` instead of
  `Payment, Text61, Text63, Text65, Text67`.

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

Built and provisioned end-to-end 2026-09-27: template trimmed, uploaded, both library rows
inserted (enabled) for the Goyard Concrete org, and verified against rendered output (pdfium)
before and after the storage round-trip. Ready to use from Download Package → "Billing form" ▸
COBE — Progress Payment / COBE — Final Payment.
