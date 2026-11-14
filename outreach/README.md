# Customer acquisition playbook

Everything here pushes traffic to **https://enamelaudits.vercel.app** with a `?ref=` tag (or a per-clinic report link), so every audit records its channel (`source` column).

| Channel | Script / asset | Automated? |
| --- | --- | --- |
| Cold email via Gmail (highest intent) | `find-leads.mjs` → `gmail-outreach.mjs`, daily via `.github/workflows/cold-email.yml` | Yes: up to 15/run, hard cap 20 per 24 h, once switched on |
| Manual email | `templates/cold-email.md` (templates, follow-ups, reply scripts) | You send by hand |
| Reddit & Facebook | `content/reddit-facebook-posts.md` + `reddit-finder.mjs` | Ready-to-copy posts; **you post by hand** |
| Launch posts | `content/launch-posts.md` | Copy/paste (SideProject, Indie Hackers, LinkedIn) |
| SEO (passive) | 44 `/guides/*`, 10 `/problems/*`, 6 `/platforms/*`, 12 `/for/*`, schema generator, sitemap | Live; submit the sitemap in Google Search Console |

## Gmail outreach: how it works

1. **Leads go into a queue in Supabase** (`private.outreach_contacts`). Each clinic is unique by **email and by domain**, so the same clinic can never be emailed twice, across any number of runs or machines.
2. **Each run** claims the next leads, runs a **real audit** of each clinic's website, and emails them their score, grade, number of fixes and a link to **their own report**. That report page is where they pay $97 (it has the Stripe checkout button).
3. **Safety rails:**
   - At most 15 emails per run, and never more than **20 in any rolling 24 hours**. The database enforces this, so re-running can't exceed it.
   - Sends are 60–150 s apart.
   - Clinics scoring 90+ or with fewer than 3 issues are skipped (don't email someone a report with nothing to fix).
   - Every email carries your name, physical address, a one-click unsubscribe link and a `List-Unsubscribe` header. Unsubscribes go straight onto the permanent suppression list.
   - If a run crashes mid-send, the affected clinic is parked as `failed` rather than retried, because the email may already have gone out.
   - Logs never print full email addresses (GitHub Actions logs are public on public repos).

### One-time setup

**1. Gmail app password** (works with @gmail.com and Google Workspace):
Google Account → Security → turn on **2-Step Verification** → search **App passwords** → create one called "Enamel Audits" → copy the 16-character password.
(Alternative: Gmail API OAuth2 with `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Note that refresh tokens from an OAuth app left in "Testing" mode expire after 7 days.)

**2. GitHub** → your repo → Settings → Secrets and variables → Actions:
- *Secrets:* `GMAIL_USER` (your Gmail address), `GMAIL_APP_PASSWORD`, `OUTREACH_TOKEN` (same value as in Vercel)
- *Variables:* `SENDER_NAME` (e.g. "Kim from Enamel Audits"), `SENDER_ADDRESS` (your postal address)

**3. Add leads** (from your computer, with `outreach/.env` filled in from `.env.example`):
```bash
node outreach/find-leads.mjs --city "Austin, TX" --max 60 --emails --enqueue   # Google Places → queue
# or, from any CSV with columns name,first_name,email,website:
node outreach/gmail-outreach.mjs --enqueue my-leads.csv
```

### Running it

From GitHub → **Actions → "Daily cold email" → Run workflow**, choose a mode:
- `verify`: checks the Gmail login and the site API. Sends nothing.
- `dry-run`: audits the next clinics in the queue and shows who would be emailed. Sends nothing, changes nothing.
- `send`: sends the batch.

To make it **daily and automatic**, add the repository variable `OUTREACH_ENABLED` = `true`. It then runs Monday–Friday at 15:07 UTC (about 10am US Eastern). Delete the variable (or set it to `false`) to stop.

Same commands locally: `node outreach/gmail-outreach.mjs --verify | (no flag = dry run) | --send | --stats`,
and `--test-to you@gmail.com --site https://a-dental-site.com` sends one sample email to yourself.

### Replies and opt-outs

Replies land in your Gmail inbox. Answer them with section 6 of `templates/cold-email.md`. Most sales come from the reply, not the first email.
Anyone who asks not to be contacted, or whose email bounces:
`node outreach/gmail-outreach.mjs --suppress person@clinic.com` (or a whole domain). That's permanent.

## Ground rules (protect your Gmail account and reputation)

- **Start slow.** A brand-new or rarely used Gmail account should start at 5–10/day for the first week. Use the `limit` input.
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
