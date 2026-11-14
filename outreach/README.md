# Customer acquisition playbook

Everything here pushes traffic to **https://enamelaudits.vercel.app** with a `?ref=` tag, so every audit records its channel (`source` column).

| Channel | Script / asset | Automated? |
| --- | --- | --- |
| Cold email (highest intent) | `find-leads.mjs` → `cold-email.mjs` | Drafts automatically; you review, then `--send` |
| X / Twitter | `x-post.mjs` + `content/x-posts.json` (24 tips) | Yes: daily via `.github/workflows/social.yml` |
| Reddit | `reddit-finder.mjs` | Finds threads + drafts replies weekly; **you post by hand**. Needs Reddit API keys on servers/CI (Reddit blocks anonymous cloud requests). |
| Launch posts | `content/launch-posts.md` | Copy/paste (SideProject, Indie Hackers, LinkedIn, FB groups) |
| SEO (passive) | 44 `/guides/*`, 8 `/for/*`, schema generator, sitemap | Live; submit sitemap in Google Search Console |

## Setup (10 minutes)

```bash
cp outreach/.env.example outreach/.env   # fill in what you'll use
npm install                              # nodemailer is already a dependency
```

`OUTREACH_TOKEN` is the same value set in Vercel (Project → Settings → Environment Variables).

## Daily routine (about 30 minutes, the part that actually makes money)

1. **Build a lead list** (once per city):
   `node outreach/find-leads.mjs --city "Austin, TX" --max 60 --emails`
   Uses the official Google Places API, then reads each practice's own site for a publicly listed contact email.
2. **Generate personalized drafts.** Each one runs a real audit of that practice's site and links to its free report:
   `node outreach/cold-email.mjs --leads outreach/out/leads-austin-tx.csv`
   Read `outreach/out/drafts-<date>.md`. Delete anyone you shouldn't contact.
3. **Send** (25/day default, 90–180 s apart):
   `node outreach/cold-email.mjs --leads outreach/out/leads-austin-tx.csv --send`
4. **Follow up once**, 4+ days later: `node outreach/cold-email.mjs --followups --send`
5. **Opt-outs.** Anyone who replies "no thanks", or bounces: `node outreach/cold-email.mjs --unsubscribe person@practice.com`
   (also accepts a domain). The suppression list is permanent.

Practices scoring 90+ or with fewer than 3 issues are skipped automatically. Don't email people a report that has nothing to fix.

## Ground rules (protect your domain and reputation)

- **CAN-SPAM (US):** the scripts include your real name, physical address, an honest subject, and an opt-out you must honor within 10 days. Keep them.
- **Outside the US:** Canada (CASL), the UK/EU (PECR/GDPR) and Australia have stricter consent rules for cold email. Start with US cities.
- **Deliverability:** send from a separate domain or mailbox (e.g. `hello@getenamelaudits.com`) with SPF/DKIM set up, warm it up (10/day the first week), and keep volume modest.
- **Reddit:** never automate comments. Answer the question; include a link only where the subreddit allows it.
- **No fake proof.** No invented testimonials or stats. `x-post.mjs --stats` only posts real aggregate numbers once there are 25+ audits.

## X autopilot

Add repo secrets `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (GitHub → Settings → Secrets → Actions).
The workflow posts one tip per day (rotating through `content/x-posts.json`) and builds a Monday Reddit digest (downloadable artifact).
Edit tips in `content/build-x-posts.mjs`, then run `node outreach/content/build-x-posts.mjs` (it enforces the 280-character limit).

## Measure

In the Supabase SQL editor:

```sql
select split_part(source, ':', 1) as channel, source, count(*) audits, count(*) filter (where paid) paid,
       sum(amount_cents) filter (where paid) / 100.0 as revenue_usd
from private.audits group by 1, 2 order by audits desc;
```
