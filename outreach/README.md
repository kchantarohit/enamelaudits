# Customer acquisition playbook

Everything here pushes traffic to **https://enamelaudits.vercel.app** with a `?ref=` tag, so every audit records its channel (`source` column).

| Channel | Script / asset | Automated? |
| --- | --- | --- |
| Cold email (highest intent) | `find-leads.mjs` → `cold-email.mjs`, manual templates in `templates/cold-email.md` | Drafts automatically; you review, then `--send` |
| Reddit & Facebook | `content/reddit-facebook-posts.md` + `reddit-finder.mjs` | Ready-to-copy posts and reply templates; the finder lists threads to answer (run it on your own computer). **You post by hand.** |
| Launch posts | `content/launch-posts.md` | Copy/paste (SideProject, Indie Hackers, LinkedIn) |
| SEO (passive) | 44 `/guides/*`, 10 `/problems/*`, 6 `/platforms/*`, 12 `/for/*`, schema generator, sitemap | Live; submit sitemap in Google Search Console |

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
- **No fake proof.** No invented testimonials or stats. Only quote numbers from your own data (see the SQL below).

## Fastest path to the first sale (today)

1. Post the **"drop your website, I'll review it"** thread from `content/reddit-facebook-posts.md` in 1–2 Facebook groups for dental office managers/owners.
2. Run 10–20 practices through the free check and send template 1 or 2 from `templates/cold-email.md` (or use `cold-email.mjs`).
3. Answer replies with the scripts in section 6 of the templates. Most sales come from the reply, not the first email.

## Measure

In the Supabase SQL editor:

```sql
select split_part(source, ':', 1) as channel, source, count(*) audits, count(*) filter (where paid) paid,
       sum(amount_cents) filter (where paid) / 100.0 as revenue_usd
from private.audits group by 1, 2 order by audits desc;
```
