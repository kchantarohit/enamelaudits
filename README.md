# Enamel Audits: automated website health reports for dental practices

A web app that sells and delivers website health reports for dental practices with no manual work. Customers pay through Stripe, and everything after that runs on its own.

| Product | Price | How it is delivered |
|---|---|---|
| Free Snapshot | $0 | The score and top 3 issues appear on screen in about 20 seconds and are emailed to the visitor. You get an email with the lead. |
| Full Health Report | $97 one-time | Stripe Checkout, then a webhook runs a full audit. The report shows on screen and is emailed right away. |
| Founding-clinic bonus | free (first 25 buyers) | The cron job re-checks the site after 28 days and emails the updated score. |
| Monitoring | $29/mo or $290/yr | The first report goes out at signup. After that, the daily cron sends a fresh report every 30 days with the score change. |
| Fix-It | from $497 | Reply-to-email quote. This is the one optional human upsell. |

## Architecture

```
public/            Static site (landing page, report page, app.js)
api/               Vercel serverless functions (Web Request/Response handlers)
  snapshot.js      POST  free audit (top 3 issues) + lead email
  checkout.js      POST/GET  creates a Stripe Checkout Session carrying the website URL
  stripe-webhook.js POST checkout.session.completed → audit → email (idempotent)
  report.js        GET   live report for a paid session (the success page)
  cron.js          GET   daily: monthly monitoring + founding re-checks
  health.js        GET   shows which integrations are configured
lib/
  audit.js         audit engine: ~40 checks in 8 categories, scoring, grading
  safe-fetch.js    SSRF-safe fetch (blocks private IPs on every redirect hop)
  fulfill.js       fulfillment and monitoring logic
  stripe.js        Stripe REST client (no SDK) + webhook signature check
  email.js         Resend REST client
  render.js        report HTML for email and the web page
server.js          local dev server that mimics Vercel
test/              node:test suite (fixture sites + mocked Stripe/Resend)
```

* **No runtime dependencies** and no build step. It needs Node 20.6 or newer.
* **No database.** Stripe metadata holds all state: the website URL, fulfillment status, last score and recheck dates. You have nothing to back up or migrate.
* **Exactly-once fulfillment.** A lock in PaymentIntent/Subscription metadata stops Stripe webhook retries from sending duplicate emails. A crashed run unlocks after 10 minutes and is retried.
* **Two delivery paths.** The success page runs and shows the report itself, so the customer gets their report even if email is delayed.

## 1. Run it locally

```bash
git clone https://github.com/kchantarohit/enamelaudits.git && cd enamelaudits
git checkout claude/automated-revenue-web-app-j3xh28
cp .env.example .env            # fill in keys (see section 2); test keys are fine
npm test                        # 13 tests: audit engine, SSRF guard, full payment flow
npm run dev                     # → http://localhost:3000
npm run audit -- https://some-dental-site.com   # run the audit engine from the CLI
```

To test real payments locally, install the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook   # copy the whsec_... into .env, then restart npm run dev
# Buy with test card 4242 4242 4242 4242, any future date, any CVC
```

## 2. Accounts and keys (one time, about 15 minutes)

1. **Stripe** (dashboard.stripe.com). Copy the secret key into `STRIPE_SECRET_KEY`. You don't need to create products, because prices are created at checkout from `PRICE_*_CENTS`.
   * Optional: under Settings → Billing → Customer portal, turn on the no-code portal and put its login link in `STRIPE_PORTAL_URL`. Subscribers can then cancel on their own.
2. **Resend** (resend.com). Create an API key for `RESEND_API_KEY`, verify your sending domain, then set `EMAIL_FROM="Enamel Audits <reports@yourdomain.com>"`.
   (Without a verified domain, Resend only delivers to your own address.)
3. **`CRON_SECRET`**: run `openssl rand -hex 32`.
4. Optional: `PAGESPEED_API_KEY` (free, from Google Cloud → PageSpeed Insights API). It adds Google's real mobile performance score to paid reports.

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel link                      # create/link the project (framework preset: "Other")

# Add env vars to production (paste each value when prompted)
for k in STRIPE_SECRET_KEY RESEND_API_KEY EMAIL_FROM OWNER_EMAIL CRON_SECRET STRIPE_PORTAL_URL PAGESPEED_API_KEY; do vercel env add $k production; done

vercel deploy --prod             # prints https://<project>.vercel.app
```

Then connect Stripe to the live URL:

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
   * URL: `https://<your-domain>/api/stripe-webhook`
   * Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
2. Copy the signing secret and add it to Vercel:
   ```bash
   vercel env add STRIPE_WEBHOOK_SECRET production
   vercel env add SITE_URL production        # e.g. https://enamelaudits.com
   vercel deploy --prod
   ```
3. Check the deploy with `curl https://<your-domain>/api/health`. Every field should be `true`.
4. Make one live purchase with a 100% promotion code (Stripe → Products → Coupons) to confirm the whole flow.

The **cron** in `vercel.json` (`/api/cron`, daily at 03:17 UTC) registers itself on deploy. Vercel sends the `CRON_SECRET` automatically. Each run handles as many due sites as fit in about 50 seconds, roughly 10 to 15 a day, or 300+ monitoring subscribers a month. On Vercel Pro, change the schedule to hourly to scale further.

**Custom domain:** Vercel → Project → Settings → Domains → add `enamelaudits.com`, then update `SITE_URL`.

### Why not GitHub Pages or Netlify?
GitHub Pages only serves static files, so it can't run checkout, webhooks or the audit. It would only work with the plain Stripe Payment Links, and delivery would be manual. Netlify can work, but you would need to wrap each `api/*.js` handler as a Netlify Function. Vercel runs the code unchanged.

## 4. Running it with no manual work

| Event | What happens | Your involvement |
|---|---|---|
| Visitor requests a snapshot | Audit runs, result shows on screen and is emailed, you get a lead email | none |
| $97 purchase | Webhook runs a full audit, emails the report, and gives a founding bonus to the first 25 buyers. You get a sale email. | none |
| Day 28 after purchase (founding) | Cron re-checks the site and emails the score change plus a monitoring upsell | none |
| Monitoring signup | First report goes out, then a fresh one every 30 days | none |
| Customer cancels | Stripe customer portal handles it; cron skips inactive subscriptions | none |
| Customer's site is down at a monthly check | Customer is emailed that the site is unreachable, and the check retries the next day | none |
| Refund request (guarantee) | Customer replies to the email | 1 click in Stripe |

Legacy fallback: the original `buy.stripe.com` Payment Links stay on the page as a no-JS/API-down fallback. If you add a custom text field with the key `website` to those links in Stripe, those orders are fulfilled automatically too.

## Security notes
* The audit only fetches public `http(s)` URLs on ports 80/443. Private, loopback, link-local and metadata IP ranges are rejected on every redirect hop. `AUDIT_ALLOW_PRIVATE=1` is for local tests only and is ignored on Vercel.
* Webhooks are verified with HMAC-SHA256 and a 5-minute timestamp tolerance.
* Report pages require a paid Checkout Session ID. One-time report links expire after 120 days. Monitoring links stop working when the subscription ends.
* The snapshot form has a honeypot field and a per-IP rate limit.
