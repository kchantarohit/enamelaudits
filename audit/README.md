# Enamel Audits report engine

Produces the reports sold on the landing page. Python 3 standard library only, no installs needed.

```bash
# Paid $97 full report (print to PDF from the browser, then email it)
python3 audit/enamel_audit.py https://clientpractice.com --name "Client Dental"

# Free snapshot (score + top 3) plus a ready-to-send email in reports/<name>-email.txt
python3 audit/enamel_audit.py https://practice.com --name "Smile Dental" --snapshot

# Prospecting: snapshot a whole list, sorted worst-first in reports/batch-summary.csv
python3 audit/enamel_audit.py --batch prospects.txt --snapshot

# Monitoring ($29/mo): add --json each month and compare the scores
python3 audit/enamel_audit.py https://client.com --name "Client" --json
```

## Getting to first revenue

1. **Build a list.** Collect 50 dental practice sites from Google Maps in one or two cities, and put them in `prospects.txt`.
2. **Batch snapshot.** Run `--batch prospects.txt --snapshot`. The lowest scores in `batch-summary.csv` are your best leads.
3. **Send personally.** Look over each snapshot before you send it, then email it with the draft in `*-email.txt`. Keep it to 10–20 per day from a normal inbox, include the opt-out line, and follow anti-spam rules (CAN-SPAM in the US, CASL in Canada, GDPR/PECR in the UK/EU). Practice emails are usually on the contact page.
4. **Follow up once** after 3–4 days. When someone pays through Stripe, run the full report and deliver it within 24 hours.
5. **Upsell.** Every full report closes with the Fix-It ($497+) and Monitoring ($29/mo) offers.

Reports go in `reports/`, which is git-ignored because it holds client data.
