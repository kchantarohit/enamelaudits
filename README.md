# Enamel Audits

Instant website health reports for dental practices. **Live: https://enamelaudits.vercel.app**

A practice enters its website and gets a 0–100 score, category scores and its top issues in about 30 seconds, free.
The full prioritized fix list (44 checks, plain-English impact, step-by-step fixes and code, 2 free re-scans) unlocks
instantly for **$97** via Stripe Checkout. Upsells: **$29/mo** monitoring (monthly re-audit) and a **Fix-It** service (from $497).

## Stack

- **Next.js 16** (App Router) + **Tailwind CSS 4** on **Vercel** (daily cron for monitoring)
- **Supabase** Postgres: tables live in a `private` schema; the app only calls `SECURITY DEFINER` RPC functions
  that require `APP_SECRET` (only its SHA-256 is stored in the DB). See `supabase/migrations/0001_init.sql`.
- **Stripe Checkout** via Payment Links tagged with `client_reference_id=<audit id>`, fulfilled by a signed webhook
  (`/api/stripe/webhook`). If `STRIPE_SECRET_KEY` is set, dynamic Checkout Sessions are used instead.

## Key paths

| Path | What |
| --- | --- |
| `src/lib/audit/engine.ts` | The audit: fetches the home page, robots, sitemap, cert, links and images; runs 44 checks |
| `src/lib/audit/catalog.ts` | Every check's copy: why it matters, how to check, how to fix. Powers reports and `/guides/*` |
| `src/lib/audit/safe-fetch.ts` | SSRF-safe fetching (public hosts only, re-checked on every redirect), timeouts, size caps |
| `src/app/report/[id]` | Free vs paid report (locked issues are never sent to unpaid viewers) |
| `src/lib/fulfil.ts` | Payment fulfilment: unlock report, legacy payment-link orders, start monitoring |
| `src/app/api/*` | audit, checkout, webhook, session-status, rescan, cron/monitor, outreach/* |
| `outreach/` | Customer acquisition scripts and content (see `outreach/README.md`) |

## Run locally

```bash
npm install
cp .env.example .env.local    # fill in values
npm run dev
npm run audit:cli -- https://example-dental.com    # run an audit from the terminal
```

## Deploy

Vercel project `enamelaudits` (team GOFJS). The project isn't Git-connected yet (the Vercel account has no GitHub
login connection), so deployments are created via the API with a tiny `vercel.json` whose `installCommand` downloads
this repo at a pinned commit from GitHub. Once GitHub is connected in Vercel (Account Settings → Login Connections),
link the repo in Project Settings → Git and deploys will happen on push.

## Operating notes

- New sale → `private.audits.paid = true`; query revenue by channel with the SQL in `outreach/README.md`.
- Refunds: issue them in the Stripe dashboard. The report stays unlocked (generous by design).
- Email is optional: set the `SMTP_*` variables to email report links to buyers and notify the owner of each sale.
