# Enamel Audits: zero-cost automated website health reports

This app sells website health reports to dental practices and delivers them automatically. It runs entirely on free tiers, uses the free `*.netlify.app` domain, and needs no database. **Fixed cost: 0 THB/month.** The only money that ever moves is Stripe's per-sale fee, which is taken out of revenue. You never pay anything upfront.

## The zero-cost stack

| Need | Service | Cost | Why this one |
|---|---|---|---|
| Hosting, API functions, scheduler | **Netlify Free** | 0 | The free plan allows commercial use, gives you `yoursite.netlify.app`, 30-second functions, and free scheduled functions. If you run out of credits the site pauses; you are never billed. |
| Payments + subscriptions | **Stripe** | 0 fixed, per-sale fee only | Checkout, receipts and subscription billing all work on the default domain. Stripe supports Thailand accounts. |
| Email delivery | **Your Gmail** (SMTP + App Password) | 0 | No domain, no email service signup. About 500 emails a day. |
| Database | **None. Stripe metadata is the store** | 0 | Each order stores its website URL, fulfillment state, scores and recheck dates on the Stripe record. Supabase or Firebase would add nothing. |
| Audit engine | Self-written, runs inside the functions | 0 | No paid APIs. The optional Google PageSpeed key is free. |

> **Why not Vercel?** The code also runs on Vercel (`vercel.json` is kept), but Vercel's free Hobby plan is for personal, non-commercial use only. A paid store has to be on Pro ($20/mo). Netlify's free plan has no such restriction, so it is the default here.

## What runs automatically

| Customer action | What happens | Your involvement |
|---|---|---|
| Requests the free snapshot | Site is audited in about 15 seconds. Score and top 3 issues appear on screen and go to the customer by email. You get a lead email. | none |
| Pays $97 for the report | Stripe calls the webhook, the full audit runs, and the report is emailed and shown on screen. The first 25 buyers get the founding bonus. You get a sale email. | none |
| 28 days later (founding buyers) | The hourly scheduled function re-checks the site and emails the score change with a monitoring upsell. | none |
| Subscribes ($29/mo or $290/yr) | First report at signup, then a fresh report every 30 days showing the score change. | none |
| Cancels | Handled by the Stripe customer portal. Inactive subscriptions are skipped. | none |
| Asks for a refund (guarantee) | Customer replies to the email. | 1 click in Stripe |

## Architecture

```
public/                    Static site: landing page, report page, app.js
api/*.js                   Request handlers (Web Request -> Response), shared by every host
  snapshot.js              POST  free audit + top 3 issues + lead alert
  checkout.js              POST/GET  creates a Stripe Checkout Session carrying the website URL
  stripe-webhook.js        POST  signed webhook -> audit -> email (exactly once)
  report.js                GET   live report for a paid session (the success page)
  cron.js                  GET   HTTP trigger for the monitoring sweep (Vercel / manual)
  health.js                GET   shows which integrations are configured
netlify/functions/*.js     Thin Netlify wrappers mapping /api/* to the handlers above
netlify/functions/monitor-scheduled.js   free hourly scheduled function (monitoring + founding re-checks)
lib/audit.js               ~40 checks in 8 categories, with a hard 18-second time budget
lib/safe-fetch.js          SSRF-safe fetch (blocks private IPs on every redirect hop)
lib/fulfill.js             idempotent fulfillment + monitoring sweep; Stripe metadata as the database
lib/email.js               Gmail SMTP (default) or Resend (optional)
lib/stripe.js              Stripe REST client (no SDK) + webhook signature check
server.js                  local dev server
test/                      17 tests: audit engine, time budget, SSRF guard, payment flow, Gmail, Netlify wrappers
```

## Setup, step by step (about 20 minutes, all free)

### Step 1: Get the code and run the tests
```bash
git clone https://github.com/kchantarohit/enamelaudits.git && cd enamelaudits
git checkout claude/automated-revenue-web-app-j3xh28
npm install
npm test                          # 17 tests, no keys needed
cp .env.example .env
sed -i.bak "s/^CRON_SECRET=.*/CRON_SECRET=$(openssl rand -hex 32)/" .env && rm .env.bak
```

### Step 2: Gmail App Password (free email, no domain)
1. Open https://myaccount.google.com/security and turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords and create one named "Enamel Audits".
3. In `.env`, set `GMAIL_USER=yourname@gmail.com` and `GMAIL_APP_PASSWORD=` followed by the 16 characters (spaces are fine).

### Step 3: Stripe (free account, test mode first)
1. Sign up at https://dashboard.stripe.com/register. Choose Thailand as the country so payouts go to a Thai bank account.
2. Go to Developers → API keys and copy the **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. You don't need to create products. Prices are created at checkout from `PRICE_*_CENTS`.

### Step 4: Test locally
```bash
npm run dev                                   # http://localhost:3000, the free snapshot works now
# In a second terminal (Stripe CLI is free: https://stripe.com/docs/stripe-cli):
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook
# Paste the printed whsec_... into STRIPE_WEBHOOK_SECRET in .env, restart npm run dev,
# then buy with test card 4242 4242 4242 4242 and check your Gmail for the report.
```

### Step 5: Deploy free to Netlify (default `*.netlify.app` domain)
```bash
npx netlify-cli login                         # free account, no card
npx netlify-cli init                          # "Create & configure a new site", pick a name, e.g. enamel-audits
# Upload the secrets (repeat for each key):
npx netlify-cli env:set STRIPE_SECRET_KEY   "sk_test_..."
npx netlify-cli env:set GMAIL_USER          "yourname@gmail.com"
npx netlify-cli env:set GMAIL_APP_PASSWORD  "xxxx xxxx xxxx xxxx"
npx netlify-cli env:set SITE_URL            "https://enamel-audits.netlify.app"
npx netlify-cli env:set OWNER_EMAIL         "kchantarohit@gmail.com"
npm run deploy                                # = npx netlify-cli deploy --prod
```
You can also skip the CLI. In the Netlify UI, choose **Add new site → Import from GitHub**, select this repo and branch, then add the variables under Site configuration → Environment variables. Netlify then redeploys on every push.

### Step 6: Connect the Stripe webhook to the live site
1. Stripe → Developers → Webhooks → **Add endpoint**: `https://<your-site>.netlify.app/api/stripe-webhook`
2. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
3. Copy the signing secret and run `npx netlify-cli env:set STRIPE_WEBHOOK_SECRET "whsec_..."`, then `npm run deploy`.
4. Check `https://<your-site>.netlify.app/api/health`. You want `stripe: true`, `webhook: true` and `email: "gmail"`.

### Step 7: Go live
1. Activate your Stripe account (business details and bank account). This is free.
2. Swap in the live keys: `STRIPE_SECRET_KEY=sk_live_...` and a live-mode webhook with its own `whsec_...`. Redeploy.
3. Make one live purchase with a 100% promotion code (Stripe → Products → Coupons) to confirm the whole flow at no cost.
4. Optional: in Stripe Settings → Billing → Customer portal, turn on the portal and copy its login link into `STRIPE_PORTAL_URL` so customers can cancel on their own.

## Free-tier limits and what happens at each
* **Gmail:** about 500 emails a day. Each order sends 1–2 emails and each snapshot sends 2. Past that, Gmail pauses sending for 24 hours, but the report still appears on screen. To scale, set `RESEND_API_KEY` (free tier, needs a domain). The code switches over automatically.
* **Netlify functions:** 30 seconds each. The audit is capped at 18 seconds (`AUDIT_BUDGET_MS`) and skips slow optional checks rather than failing. The hourly scheduler handles about 4 due sites per run, so roughly 96 a day or 2,800+ monitoring subscribers a month.
* **Netlify credits:** if the monthly free credits run out, the site pauses until the next month. You are not billed. Check usage in the Netlify dashboard.
* **PageSpeed:** Google's report often takes over 18 seconds, so on the free time budget it is included only when it finishes in time.

## Security
* The audit fetches only public `http(s)` URLs on ports 80/443. Private, loopback, link-local and metadata IP ranges are blocked on every redirect. `AUDIT_ALLOW_PRIVATE=1` is for local tests and is ignored on Netlify and Vercel.
* Stripe webhooks are HMAC-verified with a 5-minute tolerance. Fulfillment is idempotent through Stripe metadata locks, so retries never double-send.
* Report pages require a paid Checkout Session ID. One-time report links expire after 120 days. Monitoring links stop working when the subscription ends.
* Secrets live only in `.env` (git-ignored) and in Netlify environment variables.
