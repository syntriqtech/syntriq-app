# Syntriq — Project Brief

> This file is read automatically by Claude Code every time it starts in this
> folder. It tells you what we're building, how it should look, and how to work
> with me (the owner). I am new to coding — explain things in plain English and
> keep things simple. Don't over-engineer.

## What Syntriq is

Syntriq is a web app for commercial construction subcontractors that turns
their billing into finished, ready-to-send paperwork. The core job: a sub
enters their schedule of values and what they completed this period, and
Syntriq produces a professional pay application (AIA-style G702 cover sheet +
G703 continuation sheet) plus the matching California lien waivers — all
calculated correctly and carried forward period to period.

The buyer is a small-to-mid subcontractor (e.g. a tile/flooring contractor)
who currently does this by hand in Excel and gets it wrong, which delays
payment. Syntriq makes it fast, correct, and clean.

## Modules (roughly in build order)

1. **Login / accounts** — start here.
2. **Dashboard** — KPIs: Active Projects, Total Contract Value, Billed to Date,
   Outstanding Payments. Projects table + billing calendar/chart.
3. **Job Setup** — create a project: job #, customer, owner, architect,
   contract value, dates, retention rate.
4. **Schedule of Values (G703)** — the editable billing grid. Columns: Item,
   Description, Scheduled Value, Previous Applications, Current Application,
   Stored Materials, Total Completed, % Completed, Balance to Finish, Retention.
   This is the heart of the product.
5. **G702 cover sheet** — summary that rolls up the G703 totals.
6. **Lien waivers** — generate the four California statutory forms
   (conditional progress, unconditional progress, conditional final,
   unconditional final), pre-filled from the pay application.

## The billing math (already worked out)

Per G703 line: Total Completed & Stored (G) = Previous (D) + This Period (E) +
Stored Materials (F). % Complete = G / Scheduled Value. Balance to Finish =
Scheduled Value − G. Retention = retention rate × G.

Rolling to the next period: next "Previous Applications" = old (D + E); stored
materials reset and are re-entered each period.

G702 summary lines: Contract Sum to Date = Original Contract + Net Change
Orders. Total Earned Less Retainage = Total Completed & Stored − Retention.
Current Payment Due = Total Earned Less Retainage − Previous Certificates.

> There is a working Python reference engine (payapp_engine.py) that implements
> all of this. Ask me for it when we build the SOV and G702 screens so the app's
> math matches it exactly.

## Important: G702/G703 now intentionally match the AIA layout exactly

The official AIA G702/G703 forms are copyrighted. By default we'd build
clean, functionally-equivalent layouts rather than pixel copies — but the
owner has explicitly decided, with the copyright risk explained and
accepted, that Syntriq's G702/G703 should replicate the exact field layout
and wording of the reference template (AIA-G702-G703-Template.xlsx) for
internal use. Don't second-guess this back to "style only" — if the AIA
fidelity question comes up again, assume exact-match is still the intent
unless the owner says otherwise. The California lien waivers ARE public
statutory forms (Civil Code §8132–8138) and should follow the statutory
wording closely regardless.

## Brand & visual identity

- **Logo:** SyntriqLogo2.png (in this folder). Sample the exact colors from it.
- **Colors:** deep navy (~#16384A) for text, headers, and primary buttons;
  teal (~#2C9AA6) for accents, links, and secondary actions. White / very light
  gray backgrounds.
- **Look & feel:** clean, modern, trustworthy, "infrastructure" feel. Match the
  login mockup: soft rounded corners, thin light-gray input borders (NOT heavy
  black borders), generous spacing, clear hierarchy. Sans-serif font.
- **Consistency rules:** one shared input component everywhere; one shared
  button component; lock the KPI card order as Active Projects → Total Contract
  Value → Billed to Date → Outstanding. Use a left sidebar for navigation, not
  top nav.

## Tech approach

- Next.js (App Router) + TypeScript + Tailwind CSS.
- Plan for real accounts and a database later (Supabase is a likely choice for
  auth + Postgres). For now, build the UI; we'll wire up real auth when the
  screens exist.
- Keep components small and reusable. Prefer boring, standard solutions over
  clever ones.

## How to work with me

- I'm the designer/owner, new to code. Explain each step in plain English before
  and after you do it. Tell me exactly what to run or click.
- After changes, always tell me the URL to open and what I should see.
- When something breaks, walk me through the fix simply — don't assume I know
  terminal commands.
- Make one focused change at a time so I can follow along.
