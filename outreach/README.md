# Customer acquisition playbook

Everything here pushes traffic to **https://enamelaudits.vercel.app** with a `?ref=` tag (or a per-clinic report link), so every audit records its channel (`source` column).

| Channel | Script / asset | Automated? |
| --- | --- | --- |
| Cold email via Gmail (highest intent) | `find-leads.mjs` → `gmail-outreach.mjs`, daily via `.github/workflows/cold-email.yml` | Yes: up to 15/run, hard cap 20 per 24 h, once switched on |
| Manual email | `templates/cold-email.md` (templates, follow-ups, reply scripts) | You send by hand |
| Reddit & Facebook | `content/reddit-facebook-posts.md` + `reddit-finder.mjs` | Ready-to-copy posts; **you post by hand** |
| Launch posts | `content/launch-posts.md` | Copy/paste (SideProject, Indie Hackers, LinkedIn) |
| SEO (passive) | 44 `/guides/*`, 10 `/problems/*`, 6 `/platforms/*`, 12 `/for/*`, schema generator, sitemap | Live; submit the sitemap in Google Search Console |

## Gmail outreach: hands-free (how it works)

Two GitHub Actions run everything; nothing needs your computer, and nothing needs you to click send.

| Workflow | File | When (UTC cron) | What it does |
|---|---|---|---|
| **Daily lead finder** | `.github/workflows/find-leads.yml` | every day 10:41 UTC (~4:41am Central) | Picks one US state per day, loads its OpenStreetMap data (Geofabrik extract + osmium), keeps independent dental practices **outside cities of 50k+**, finds the email each one publishes on its own site, runs the real audit, and queues up to 12 strong prospects. Weak ones are recorded so they're never checked again. |
| **Hourly cold email** | `.github/workflows/cold-email.yml` | Mon–Fri at :17 past each hour, 14:17–23:17 UTC | Sends **1 email per run**, only between **9:00 and 17:59 US Central**, max **9 per Central-time day** (and never more than 20 per rolling 24 h). Former Gmail drafts (hand-checked copy) go first, exactly as written. |

1. **The queue lives in Supabase** (`private.outreach_contacts`). Each clinic is unique by **email and by domain**, so the same clinic can never be emailed twice, across any number of runs or machines.
2. **Each send** runs a fresh audit of the clinic's website (unless the row carries hand-checked copy) and emails them their score, grade, number of fixes and a link to **their own report**. That report page is where they pay $97.
3. **Safety rails:**
   - Daily cap enforced in the database (per Central-time day and per rolling 24 h), so extra or overlapping runs can't exceed it.
   - Only practices with a real, patient-facing problem are emailed (e.g. phone not tap-to-call, no booking button on the home page, http not redirecting to https, zoom blocked, slow server, missing Google basics). Sites scoring 90+ or with only security-header nits are skipped.
   - Emails only claim what the home-page audit checked.
   - Every email carries your name, physical address, a one-click unsubscribe link and a `List-Unsubscribe` header. Unsubscribes go straight onto the permanent suppression list.
   - If a run crashes mid-send, the affected clinic is parked as `failed` rather than retried, because the email may already have gone out.
   - Logs never print email addresses (this repo is public, so Actions logs are public).

### One-time setup

**1. Gmail app password** (works with @gmail.com and Google Workspace):
Google Account → Security → turn on **2-Step Verification** → search **App passwords** → create one called "Enamel Audits" → copy the 16-character password.
(Alternative: Gmail API OAuth2 with `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Refresh tokens from an OAuth app left in "Testing" mode expire after 7 days, so the app password is the hands-free choice.)

**2. GitHub** → this repo → Settings → Secrets and variables → Actions:
- *Secrets:* `GMAIL_USER` (your Gmail address), `GMAIL_APP_PASSWORD`, `OUTREACH_TOKEN` (same value as `OUTREACH_TOKEN` in Vercel)
- *Variables:* `OUTREACH_ENABLED` = `true` (turns both schedules on), `SENDER_NAME`, `SENDER_ADDRESS` (your postal address, required by CAN-SPAM)
- *Optional variables:* `OUTREACH_DAY_CAP` (default 9, keep ≤ 10), `LEADS_DAILY_TARGET` (default 12), `REPLY_TO`

**3. Test once by hand:** Actions → **Hourly cold email** → Run workflow → `verify` (checks the Gmail login and site API, sends nothing), then **Daily lead finder** → Run workflow with *dry run* ticked.

To pause everything, set `OUTREACH_ENABLED` to `false` (or delete it). Manual runs still work.

Same commands locally: `node outreach/gmail-outreach.mjs --verify | (no flag = dry run) | --send | --stats`,
`--test-to you@gmail.com --site https://a-dental-site.com` sends one sample email to yourself, and
`npx tsx outreach/auto-leads.ts --state KS --dry-run` previews the lead finder (needs `osmium-tool` installed, or it uses the Overpass API).

### Replies and opt-outs

Replies land in your Gmail inbox. Answer them with section 6 of `templates/cold-email.md`. Most sales come from the reply, not the first email.
Anyone who asks not to be contacted, or whose email bounces:
`node outreach/gmail-outreach.mjs --suppress person@clinic.com` (or a whole domain). That's permanent.

## Ground rules (protect your Gmail account and reputation)

- **Start slow.** A brand-new or rarely used Gmail account should start at 5–10/day for the first week (`OUTREACH_DAY_CAP`).
- **Better deliverability:** a Google Workspace mailbox on your own domain (with SPF/DKIM) is far safer than a personal @gmail.com for cold email.
- **CAN-SPAM (US):** keep the honest subject, your real name, physical address and the unsubscribe link. Honor opt-outs (automatic here).
- **Outside the US:** Canada (CASL), the UK/EU (PECR/GDPR) and Australia have stricter consent rules for cold email. Start with US cities.
- **Reddit:** never automate comments. Answer the question; link only where the subreddit allows it.
- **No fake proof.** No invented testimonials or stats.

## Measure

In the Supabase SQL editor:

```sql
-- outreach funnel
select status, count(*) from private.outreach_contacts group by 1 order by 2 desc;

-- audits and revenue by channel
select split_part(source, ':', 1) as channel, count(*) audits, count(*) filter (where paid) paid,
       sum(amount_cents) filter (where paid) / 100.0 as revenue_usd
from private.audits group by 1 order by audits desc;
```
