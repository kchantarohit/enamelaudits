# Cold email templates (ready to use)

Use these by hand (Gmail, Outlook) or let `outreach/cold-email.mjs` fill them in automatically.
Before every email, run the practice's site through **https://enamelaudits.vercel.app/?ref=email** (or let the script do it)
so the email quotes **real findings** and links to **their own free report**. That link is what gets replies.

**Placeholders:** `{{first_name}}` (use "there" if unknown) · `{{practice}}` · `{{domain}}` · `{{score}}` · `{{grade}}` ·
`{{issue_1}}` / `{{issue_2}}` (issue titles from the report) · `{{detail_1}}` (the "What we found" line) ·
`{{issue_count}}` · `{{report_url}}` · `{{city}}` · `{{your_name}}` · `{{your_address}}`

**Rules that keep you out of spam folders and on the right side of CAN-SPAM:**
honest subject lines (no fake "Re:" or "Fwd:" on a first email) · your real name + physical address in every email ·
a clear way to opt out, honored forever · max 2 follow-ups · plain text, one link · 20–30 emails/day per mailbox.

---

## 1. Default: "your score" (best all-rounder)

**Subject options:** `{{practice}}: your website scored {{score}}/100` · `Quick website check for {{practice}}` · `{{domain}}: 3 quick fixes`

```
Hi {{first_name}},

I ran {{domain}} through our dental website checker and it scored {{score}}/100 (grade {{grade}}).

The biggest thing it flagged: "{{issue_1}}." {{detail_1}}
It also noticed: "{{issue_2}}."

Your free summary is here (no login or signup): {{report_url}}

Most of these are quick fixes for whoever manages your site. If you'd like the complete fix list ({{issue_count}} items, step by step), it's $97 on that page, refunded if it doesn't find at least 3 real improvements.

Either way, I hope the summary is useful.

{{your_name}}
Enamel Audits · {{your_address}}

Not interested? Reply "no thanks" and you won't hear from me again.
```

---

## 2. Issue-specific openers (swap in when the top issue matches; they convert better)

Keep the rest of template 1; replace its first two paragraphs with one of these.

**Phone number isn't tap-to-call** · Subject: `{{practice}}: patients can't tap your number`
```
I was looking at {{domain}} on my phone and noticed your phone number isn't tappable. Mobile visitors have to copy it by hand, which is exactly when people give up and call the next practice. It's a two-minute fix.
```

**No online booking / appointment request** · Subject: `Booking from {{domain}} after hours`
```
I tried to book a visit on {{domain}} the way a new patient would at 9pm, and couldn't find a way to book or request an appointment online. A lot of people search for a dentist after hours, so that's usually worth fixing first.
```

**Site not secure (no HTTPS) / certificate problem** · Subject: `{{domain}} shows "Not secure"`
```
Heads up: {{domain}} shows a "Not secure" warning in the browser, right next to your practice name. For a healthcare practice that warning alone can make a new patient leave. The fix is usually a free certificate and one redirect.
```

**noindex / robots.txt blocking Google** (urgent; send this one first) · Subject: `{{domain}} may be hidden from Google`
```
I ran a quick check on {{domain}} and it's telling Google not to list it (a "noindex" setting, often left on by accident after a redesign). If that's not intentional, your site may be missing from search results entirely. It's a one-setting fix.
```

**Slow server / heavy images** · Subject: `{{domain}} loads slowly on phones`
```
{{domain}} took a while to start loading in our check ({{detail_1}}). On a phone with mobile data that usually means a few seconds of blank screen, which is when people tap back to the search results.
```

**Missing Google basics (title, description, sitemap, Dentist schema)** · Subject: `{{practice}} on Google: a few missing basics`
```
I checked how {{domain}} is set up for Google and a few basics are missing: "{{issue_1}}" and "{{issue_2}}". None of them are visible to patients, but they affect how (and whether) you show up for "dentist near me" searches.
```

---

## 3. Office-manager angle (when the email goes to info@ / frontdesk@)

**Subject:** `For whoever manages the {{practice}} website`
```
Hi {{first_name}},

Could you pass this to whoever looks after your website? I ran {{domain}} through a dental website checker and it found {{issue_count}} fixable issues, starting with "{{issue_1}}".

Here's the free summary they can look at: {{report_url}}

No login needed, and nothing to install. If they'd like the full step-by-step fix list it's on the same page.

Thanks!
{{your_name}}
Enamel Audits · {{your_address}}
Reply "no thanks" and I won't email again.
```

---

## 4. "You already pay an agency" angle

**Subject:** `Something to check with your web agency`
```
Hi {{first_name}},

If an agency manages {{domain}}, this might be worth forwarding to them. Our checker flagged "{{issue_1}}" and {{issue_count}} other items, most of which are quick for a web developer to fix.

Free summary: {{report_url}}

A lot of practices use the full report as a checklist to make sure they're getting what they pay for each month.

{{your_name}}
Enamel Audits · {{your_address}}
Reply "no thanks" to opt out.
```

---

## 5. Follow-ups (send to non-responders only; never more than two)

**Follow-up 1 (day 4)** · Subject: same thread, `Re: <your original subject>` (it *is* a reply now)
```
Hi {{first_name}}, just bumping this in case it got buried. The free summary for {{domain}} is still here: {{report_url}}

The top item ("{{issue_1}}") is usually the quickest win.

{{your_name}}
```

**Follow-up 2 / last one (day 10)**
```
Hi {{first_name}}, last note from me. If the website isn't a priority right now, no problem at all. The summary link will keep working if you want it later: {{report_url}}

{{your_name}} · Enamel Audits · {{your_address}}
```

---

## 6. Replies: what to say when they answer

**"How much?" / "What's the catch?"**
```
No catch. The summary is free. The full report is a one-time $97: every issue in priority order, why it matters, and step-by-step fixes your web person can follow, plus two free re-scans to confirm the fixes. If it doesn't find at least 3 real improvements you get a full refund. You can unlock it on the same page: {{report_url}}
```

**"Who are you / how did you get my email?"**
```
Fair question! I'm {{your_name}}. I run Enamel Audits, which checks dental practice websites. I found your email listed on {{domain}} and ran your public homepage through our checker (nothing private, only what any patient can see). Happy to remove you; just say the word.
```
(Then add them to the suppression list: `node outreach/cold-email.mjs --unsubscribe their@email.com`.)

**"Our agency handles that"**
```
Great, then the free summary is probably most useful as a quick checklist for them: {{report_url}}. If they'd like the step-by-step version, the full report is built for exactly that handoff.
```

**"Can you just fix it for us?"**
```
Yes. We offer a Fix-It service starting at $497. I'll look at your report and send a fixed quote before any work starts, then re-check the site when it's done. Who's the best person to send the quote to?
```

**"Already fixed it" / "Thanks!"**
```
Nice work! You can run a fresh check any time at https://enamelaudits.vercel.app to confirm. If you ever want a monthly check-up, monitoring is $29/month and emails you if anything breaks.
```

**"Not interested" / "Remove me"**
```
Understood, you're off the list. Sorry for the bother!
```
(Add them to the suppression list immediately.)

---

## 7. Phone script for the front desk (optional, 30 seconds)

```
Hi, this is {{your_name}}. Quick one: I ran your website through a dental website checker and it found a couple of things
that make it harder for new patients to book, like {{issue_1 in plain words}}. Could I email the free summary to whoever
manages the website? ... Great, what's the best address? Thanks!
```
Then send template 3 with "As promised on the phone" as the first line. (Calling first, then emailing, usually gets the highest reply rate.)
