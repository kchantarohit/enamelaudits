# Reddit & Facebook outreach posts (ready to copy)

How to use these without getting banned:
- **Read each community's rules first.** Many ban links in posts; put the link in a comment only if allowed or if someone asks.
- **Lead with the useful part.** Every post below is helpful on its own, even if nobody clicks.
- **Post from your own account, by hand, one community per day.** Reply to every comment within a few hours.
- **Never invent numbers or stories.** Where a post needs a real number, it says `[from your stats]`; use the Supabase query in `outreach/README.md`, or leave the line out.
- Each link carries a `?ref=` tag so you can see which post brought in audits and sales.

---

## The highest-converting format: "drop your website, I'll review it"

Works in Facebook groups for dental office managers/owners and in r/smallbusiness ("feedback Friday"-style threads).

**Post:**
> **Free website check for dental practices: drop your site below 👇**
>
> I build tools that check dental practice websites for the things that quietly cost new patients: phone numbers you can't tap on a phone, no way to book after hours, "Not secure" warnings, missing Google basics, slow pages.
>
> Comment your practice website and I'll reply with the top 3 things I'd fix first. Free, no strings, no sales calls.

**Your reply to each comment** (run their site at https://enamelaudits.vercel.app/?ref=fb-review first):
> Took a look at {{domain}}. It scored {{score}}/100. Top 3 I'd fix:
> 1. {{issue_1}}: {{one-line why}}
> 2. {{issue_2}}
> 3. {{issue_3}}
>
> All quick fixes for whoever manages your site. Here's your free summary if you want to pass it on: {{report_url}}

Why it works: every reply is public proof you know what you're talking about, and each one is a warm lead.

---

## Reddit

### r/Dentistry (practice owners read it; no self-promo, so no link in the post)

**Title:** 5-minute check to see if your practice website is losing new patients (no tools needed)

> Most practice websites don't break. They quietly leak patients. Here's a quick check anyone at the front desk can do, on a phone using mobile data (not office Wi-Fi):
>
> 1. **Search your practice name on Google.** Is the headline your practice name + town? Is the grey text under it a real description, or random menu text?
> 2. **Open the site.** Does anything appear within 2 seconds, or is it a blank white screen?
> 3. **Tap the phone number.** Does it offer to call? If not, every mobile visitor has to copy it by hand.
> 4. **Try to book at "9pm".** Can you book or request an appointment in two taps without calling?
> 5. **Look at the address bar.** Padlock, or "Not secure"?
> 6. **Scroll to the footer.** Is the copyright year current? Hours and address visible?
>
> Anything that fails is usually a quick fix for whoever manages the site. Happy to answer questions on any of these in the comments.

*(If someone asks for a tool, reply: "I built a free one that checks these plus ~40 more: https://enamelaudits.vercel.app/?ref=reddit-dentistry")*

### r/smallbusiness

**Title:** I build website checkers for dental practices. These are the problems I see over and over

> Dental practices are a good example of a business where the website is built once by an agency and then nobody checks it. The issues that come up again and again:
>
> - **Phone number isn't a tap-to-call link.** On mobile, the visitor has to memorize or copy it.
> - **No way to book outside office hours.** People look for a dentist at night; if they can't book, they pick someone who lets them.
> - **A leftover "noindex" tag after a redesign,** which tells Google to hide the site.
> - **Huge photos** straight from the camera, so the site is slow on mobile data.
> - **No structured data** (schema) telling Google the business name, address, phone and hours.
> - **Copyright year from years ago,** which makes visitors wonder if the hours and prices are current too.
>
> Most of these apply to any local business, not just dentists. If you want, drop your site and I'll tell you which ones apply.

### r/SEO or r/localseo (tool links are usually OK here; check the rules)

**Title:** Free Dentist schema generator (JSON-LD), no signup

> Made a small free tool for local SEO on dental sites: fill in name, address, phone and hours, and it outputs Dentist JSON-LD with OpeningHoursSpecification and sameAs. Copy, paste into the head, then validate in Rich Results Test.
>
> https://enamelaudits.vercel.app/tools/dentist-schema-generator?ref=reddit-seo
>
> Feedback welcome, especially on fields you'd want added (departments for multi-location? medicalSpecialty?).

### r/SideProject, r/indiehackers, r/EntrepreneurRideAlong (self-promo allowed)

**Title:** Built a niche SaaS: instant website audits for dental practices ($97 one-time). Here's the setup

> **What:** a practice enters its website and gets a 0–100 score plus its top issues free in ~30 seconds. The full fix list (44 checks, step-by-step fixes) is $97 and unlocks instantly.
> **Why dentists:** lots of practices, each new patient is worth a lot to them, and the office manager can pay $97 on a card without a committee.
> **Stack:** Next.js on Vercel, Supabase, Stripe Payment Links + webhook.
> **Acquisition:** 44 fix guides + practice-type and platform pages for SEO, a free schema generator, and personalized cold email where every email links to a real audit of that practice's own site.
>
> https://enamelaudits.vercel.app/?ref=reddit-sideproject
>
> Happy to answer questions about the build or the niche. Roast the landing page if you like.

### Comment reply templates (for threads the Reddit finder surfaces)

**"Can someone review my dental website?"**
> Took a look. Three things I'd fix first:
> 1. {{finding 1}}
> 2. {{finding 2}}
> 3. {{finding 3}}
>
> All quick for whoever manages the site. (I used a free checker I built, https://enamelaudits.vercel.app/?ref=reddit, if you want the full list.)

**"Is it worth redesigning our practice website?"**
> Before paying for a redesign, get a list of what's actually wrong. A lot of "we need a new site" turns out to be a handful of fixable issues: slow images, no tap-to-call, missing Google basics. Fix those first, then decide if the design itself is the problem.

**"How do I get my practice to show up on Google?"**
> The website side is mostly basics: a page title with your practice name + town, a meta description, a sitemap submitted in Search Console, Dentist schema that matches your Google Business Profile exactly, and making sure nothing tells Google not to index you. (Reviews and your Business Profile matter a lot too.)

---

## Facebook

### Dental office managers / practice owners groups (value post; link only in comments if allowed)

> **Quick 2-minute check you can do on your practice website today** 📱
>
> 1. Open your site on your phone using mobile data (not office Wi-Fi)
> 2. Tap your phone number. Does it offer to call?
> 3. Count how long the screen stays blank. More than 2 seconds is a problem
> 4. Can you book or request an appointment in two taps?
> 5. Scroll to the footer. Is the copyright year current?
>
> If any of those fail, they're usually quick fixes for whoever manages your website. Happy to share a free tool that checks 44 of these automatically if anyone wants it. Just comment "check".

**When someone comments "check":**
> Here you go: https://enamelaudits.vercel.app/?ref=fb-group. Pop in your website and you'll get your score and top issues in about 30 seconds. Happy to explain anything it flags!

### Local business groups ("[City] Small Business Owners")

> Local business owners: when did you last look at your website **on your phone**, the way customers do?
>
> The most common problems I see on local business sites: phone numbers you can't tap to call, no way to book after hours, "Not secure" warnings, and pages that take ages on mobile data.
>
> If you run a dental practice, I built a free checker for exactly this: https://enamelaudits.vercel.app/?ref=fb-local. (Other businesses: drop your site in the comments and I'll take a quick look.)

### Your own Facebook / LinkedIn profile (friends often know a dentist)

> I built something new: a free website check for dental practices. It tells a practice in 30 seconds whether its website is costing it new patients (slow pages, no tap-to-call, no online booking, missing Google basics) and exactly how to fix it.
>
> If you know a dentist or a dental office manager, I'd be grateful if you sent them this: https://enamelaudits.vercel.app/?ref=personal

---

## DM template (only to people who engaged with a post or asked)

> Hi {{name}}, thanks for commenting on my post! I ran {{domain}} through the checker. It scored {{score}}/100, and the biggest fix is "{{issue_1}}". Here's the free summary: {{report_url}}. Any questions about it, just ask.
