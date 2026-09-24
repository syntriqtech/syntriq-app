# CTI Billing Workbook — Field Mapping (for Custom Billing Forms feature)

Source file: `Billing_Workbook_Master_Temp.xlsx` (CTI's actual master billing workbook, provided by Jason 2026-09-24)

## Structure
8 sheets: JOB INFORMATION, INVOICE COVER, PAYMENT APPLICATION, SCEDULE OF VALUES, CONDITIONAL PROGRESS, UNCONDITIONAL PROGRESS, CONDITIONAL FINAL, UNCONDITIONAL FINAL.

Key finding: Invoice Cover, Payment Application, and the SOV totals are almost entirely **internal formulas** referencing each other. Syntriq only needs to write to a small set of raw input cells — everything else (totals, %, retainage, balance to finish, etc.) recalculates automatically via the workbook's own existing formulas. Do not overwrite formula cells; only write to the input cells below.

## Input cells — JOB INFORMATION sheet (filled once per job)

| Cell | Syntriq field |
|---|---|
| E6 | GC Name |
| E7 | GC Project # |
| E8 | GC Street |
| E9 | GC City/State/Zip |
| E10 | GC Phone |
| E11 | GC Fax |
| E12 | GC PM Name |
| E13 | GC Email |
| E14 | GC PM Mobile |
| M6 | Job Name |
| M7 | PO Number |
| M8 | Job Street |
| M9 | Job City/State/Zip |
| M10 | Original Contract Value |
| M11 | OH&P % |
| M12 | CTI PM Name |
| M13 | CTI Email |
| M14 | CTI Phone |
| W6 | Current Contract Retention % |
| W7 | Previous Contract Retention % |
| W10 | Current Change Order Retention % |
| W11 | Previous CO Retention % |
| W12 | Owner Name |

## Input cells — SCEDULE OF VALUES sheet

| Cell(s) | Syntriq field |
|---|---|
| H7 | Application Number — **auto-populate from Syntriq's pay application record, not manual entry** |
| H8 | Application Date — **auto-populate from Syntriq's pay application record, not manual entry** |
| H9 | Period To — **auto-populate from Syntriq's pay application record, not manual entry** |
| H10 | Unclear/unlabeled in this template — leave as-is unless it turns out to matter; not blocking |
| B14:B38, C14:C38 | Line item #, Description (contract SOV lines) |
| D14:D38 | Scheduled Value per line |
| E14:E38 | Previous Applications (billed to date, prior period) |
| I14:I38 | % Complete this application (drives F/H/J/K columns via existing formulas) |
| G14:G38 | Stored Materials (manual override, defaults 0) |
| L14:L38 | Paid Retention (manual override, defaults 0) |
| Rows 42–53, same columns | Change order line items (same pattern, keyed off W10 retention rate instead of W6) |

## Decisions
- Application Number/Date/Period To on SOV should be **auto-populated by Syntriq from the pay application record** at generation time, not left for manual entry — consistent with how Syntriq already tracks application sequencing.
- General note on GC-specific forms (applies beyond CTI, to the GC-level template work like 24/7 Concrete's COBE form too): some GC-provided billing forms are internally inconsistent or "wonky" by design — nothing to fix on Syntriq's end. The bar for these templates is filling the fields that matter correctly, not making the GC's own form make perfect sense.
- CTI's 4 lien waiver sheets (Conditional/Unconditional Progress, Conditional/Unconditional Final) already exist in this workbook and follow the same input-cell pattern (not yet individually mapped — map when building the lien waiver portion of the org-level template).

## Status
First-pass mapping confirmed by Jason (2026-09-24). Ready to hand to the Claude Code build session for the org-level "Custom Billing Forms" feature (CTI as first template).
