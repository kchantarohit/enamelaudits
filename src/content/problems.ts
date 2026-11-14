export interface Problem {
  slug: string;
  title: string;
  description: string;
  intro: string;
  causes: { check: string; explain: string }[];
  steps: string[];
  whenToGetHelp: string;
  faq: { q: string; a: string }[];
}

/** Symptom-first pages: the questions practice owners actually type into Google. */
export const PROBLEMS: Problem[] = [
  {
    slug: "dental-website-not-showing-on-google",
    title: "Why isn't my dental website showing up on Google?",
    description: "Your practice website isn't showing on Google? The most common technical causes, how to check each one in minutes, and how to fix them.",
    intro:
      "If patients can find your Google Business Profile but not your website, or your site doesn't appear even when you search your own practice name, the cause is often technical and fixable. Start with the checks that can hide a site completely, then work down to the ones that weaken it.",
    causes: [
      { check: "noindex", explain: "A 'noindex' setting tells Google to leave the page out of results. It's often left on by accident after a redesign." },
      { check: "robots_txt", explain: "A robots.txt file with 'Disallow: /' blocks search engines from the whole site." },
      { check: "sitemap", explain: "Without a sitemap, Google can be slow to discover service pages like implants or Invisalign." },
      { check: "title", explain: "A vague page title ('Home') gives Google little to match against searches like 'dentist in [town]'." },
      { check: "local_schema", explain: "Dentist structured data helps Google connect your website with your location and your Business Profile." },
      { check: "https", explain: "Secure (HTTPS) sites are preferred, and 'Not secure' warnings put off the patients who do find you." },
    ],
    steps: [
      "Search Google for site:yourpractice.com. If nothing comes back, Google isn't indexing the site at all, so check noindex and robots.txt first.",
      "Search your exact practice name. If your Business Profile shows but the website doesn't, check the page title and structured data.",
      "Set up Google Search Console (free), verify your site, submit your sitemap, and look at the Pages report for anything excluded.",
      "Run the free Enamel Audits check to test all of the above at once.",
    ],
    whenToGetHelp:
      "If Search Console shows manual actions or security issues, or the site was recently migrated to a new domain, get a developer involved. Those need careful handling.",
    faq: [
      { q: "How long does it take to show up after fixing it?", a: "Once a blocking setting is removed and you request indexing in Search Console, pages often reappear within days, though it varies." },
      { q: "Is this the same as my Google Business Profile?", a: "No. Your Business Profile (the map listing) is managed separately at business.google.com. Both matter, and they should show the same name, address and phone." },
    ],
  },
  {
    slug: "dental-website-says-not-secure",
    title: "Why does my dental website say \"Not secure\"?",
    description: "Seeing \"Not secure\" next to your practice website? What it means, why it scares patients away, and how to fix HTTPS and certificate problems.",
    intro:
      "Browsers show \"Not secure\" when a page loads over plain http://, or when part of an https page loads insecure files. For a healthcare provider, that label right next to your name is a fast way to lose a new patient's trust.",
    causes: [
      { check: "https", explain: "The site has no SSL certificate, or isn't using it." },
      { check: "http_redirect", explain: "The secure version exists, but people typing your address still land on the insecure one." },
      { check: "ssl_certificate", explain: "The certificate expired, didn't renew, or doesn't cover the www version of your domain." },
      { check: "mixed_content", explain: "An https page loads images or scripts over http://, which breaks the padlock." },
    ],
    steps: [
      "Visit your site and click the icon to the left of the address. It tells you whether the connection is secure and when the certificate expires.",
      "Type http://yourpractice.com (with http). It should jump straight to https://.",
      "Ask your host to install a free Let's Encrypt certificate with auto-renewal, and to force HTTPS.",
      "Re-run the free check to confirm there's no mixed content left.",
    ],
    whenToGetHelp: "If the certificate keeps expiring, or the warning appears only on some pages, a developer should check the renewal setup and the old http:// links in your content.",
    faq: [
      { q: "Does an SSL certificate cost money?", a: "Usually not. Most hosts provide free Let's Encrypt certificates, and platforms like Wix and Squarespace include one." },
      { q: "Does HTTPS affect Google rankings?", a: "Google treats HTTPS as a positive signal, and the 'Not secure' label hurts trust with patients regardless." },
    ],
  },
  {
    slug: "dental-website-slow-on-mobile",
    title: "Why is my dental website so slow on phones?",
    description: "Dental website slow on mobile? The usual culprits (slow hosting, huge photos, heavy widgets) and how to check and fix each one.",
    intro:
      "Your website can feel fine on the office computer and still crawl on a patient's phone over mobile data. The good news: slow dental websites almost always come down to the same few causes.",
    causes: [
      { check: "server_response", explain: "The server takes too long to respond, so the screen stays blank. Usually budget hosting or no caching." },
      { check: "image_weight", explain: "Photos uploaded straight from a camera or stock site, often several megabytes each." },
      { check: "render_blocking", explain: "Chat, review and tracking scripts that must load before anything appears." },
      { check: "page_requests", explain: "Dozens of separate files from plugins and widgets." },
      { check: "compression", explain: "Pages sent without gzip/Brotli compression." },
    ],
    steps: [
      "Open your site on your phone with Wi-Fi turned off and count the seconds of blank screen.",
      "Run it through Google's PageSpeed Insights (pagespeed.web.dev) for a detailed breakdown.",
      "Fix in this order: caching/hosting, image sizes, then third-party widgets.",
      "Re-test after each change so you know what helped.",
    ],
    whenToGetHelp: "If caching and image compression don't help, the hosting plan or the theme itself may be the bottleneck. That's a job for your web developer.",
    faq: [
      { q: "How fast should a dental website be?", a: "Aim for the server to respond in under a second and for the main content to appear within about 2–3 seconds on mobile." },
      { q: "Do I need a new website to fix speed?", a: "Usually not. Caching, image compression and removing unused widgets fix most slow sites." },
    ],
  },
  {
    slug: "website-not-bringing-new-patients",
    title: "Why isn't my dental website bringing in new patients?",
    description: "Getting visitors but few new patients from your dental website? The conversion problems to check first: tap-to-call, booking, insurance info, trust and speed.",
    intro:
      "If people visit your website but don't call or book, the problem is usually friction at the moment they're ready to act. Look at the site the way a new patient does: on a phone, comparing you with two other practices.",
    causes: [
      { check: "tel_link", explain: "Patients can't tap your number to call." },
      { check: "online_booking", explain: "No way to book or request an appointment outside office hours." },
      { check: "insurance_info", explain: "No answer to 'Do you take my insurance?' or 'What will it cost?'." },
      { check: "new_patients", explain: "No clear page telling new patients what to expect." },
      { check: "reviews", explain: "No social proof on the page where people decide." },
      { check: "server_response", explain: "A slow site loses impatient mobile visitors before they see anything." },
      { check: "analytics", explain: "Without analytics, you can't see where people drop off." },
    ],
    steps: [
      "On your phone, try to call, then try to book, starting from the home page. Count the taps.",
      "Check that insurance, financing, hours and location are visible without digging.",
      "Set up analytics events for phone taps and booking clicks so you can measure improvements.",
      "Run the free check to find the specific friction points on your site.",
    ],
    whenToGetHelp: "If the site converts poorly after the basics are fixed, the offer, reviews and Google Business Profile may matter more than the website itself.",
    faq: [
      { q: "Is it the website or our marketing?", a: "Often both. Fix the website friction first: it makes every marketing dollar work harder." },
      { q: "What's the single most important fix?", a: "For most practices: a tap-to-call button and a booking button in the mobile header." },
    ],
  },
  {
    slug: "google-shows-wrong-hours-or-phone-number",
    title: "Google shows the wrong hours or phone number for my dental practice",
    description: "Google displaying the wrong hours, phone or address for your practice? How your website, schema and Business Profile interact, and how to make them agree.",
    intro:
      "Google pulls your practice details from several places: your Google Business Profile, your website and other directories. When they disagree, Google may show patients the wrong information. Make your website a clear, consistent source.",
    causes: [
      { check: "local_schema", explain: "Missing or outdated Dentist structured data leaves Google guessing." },
      { check: "address_visible", explain: "The address isn't written as text on your site, or differs from your Business Profile." },
      { check: "hours", explain: "Hours aren't visible on the site, or differ between pages." },
      { check: "tel_link", explain: "Different phone numbers on different pages (e.g. old tracking numbers)." },
    ],
    steps: [
      "Update your hours and phone in your Google Business Profile first (business.google.com).",
      "Make the website footer show exactly the same name, address, phone and hours.",
      "Add or update Dentist structured data with the same details (use our free generator).",
      "Update the big directories (Yelp, Healthgrades, Zocdoc, Facebook) to match.",
    ],
    whenToGetHelp: "If Google keeps reverting your edits, contact Google Business Profile support. Conflicting information elsewhere online is usually the cause.",
    faq: [
      { q: "How long until Google updates?", a: "Business Profile edits can show within days; website changes are picked up when Google next crawls your site." },
      { q: "Should holiday hours go on the website?", a: "Yes. Add special hours in your Business Profile and a short notice on the site." },
    ],
  },
  {
    slug: "dental-website-not-mobile-friendly",
    title: "Is my dental website mobile-friendly? How to check and fix it",
    description: "Most patients find their dentist on a phone. How to tell if your dental website is mobile-friendly, and the fixes for tiny text, blocked zoom and hard-to-tap buttons.",
    intro:
      "Most dental website visits come from phones. A site that wasn't built for mobile shows a shrunken desktop page, blocks zooming, or hides the call and booking buttons below the fold.",
    causes: [
      { check: "viewport", explain: "No mobile viewport setting, so phones render the desktop layout." },
      { check: "zoom_enabled", explain: "Pinch-to-zoom is disabled, which frustrates older patients." },
      { check: "tel_link", explain: "Phone numbers you can't tap." },
      { check: "image_weight", explain: "Huge images that load slowly on mobile data." },
    ],
    steps: [
      "Open your site on your phone. Can you read everything without zooming?",
      "Try to pinch-zoom. It should work.",
      "Tap the phone number and the booking button. Both should be easy to hit with a thumb.",
      "Run the free check for the technical details.",
    ],
    whenToGetHelp: "If the layout itself breaks on phones (overlapping text, sideways scrolling), the theme isn't responsive and needs a developer, or a template change.",
    faq: [
      { q: "Does Google care about mobile?", a: "Yes. Google primarily uses the mobile version of your site to decide how to rank it." },
      { q: "Do we need a separate mobile site?", a: "No. A single responsive site that adapts to screen size is the standard approach." },
    ],
  },
  {
    slug: "is-my-dental-website-ada-compliant",
    title: "Is my dental website ADA compliant? Accessibility basics to check",
    description: "Wondering if your dental website is accessible? The basic accessibility checks (alt text, form labels, zoom, link text) and where to get a proper compliance review.",
    intro:
      "Accessibility means people with disabilities can use your website: patients using screen readers, people with low vision, and anyone who can't use a mouse. Our check covers the common basics. It is not a legal audit or legal advice; for compliance questions, talk to a qualified professional.",
    causes: [
      { check: "img_alt", explain: "Images without alt text are invisible to screen-reader users." },
      { check: "form_labels", explain: "Appointment and contact forms whose fields have no labels." },
      { check: "zoom_enabled", explain: "Blocked pinch-to-zoom stops low-vision patients reading your site." },
      { check: "html_lang", explain: "No page language set, so screen readers may mispronounce content." },
      { check: "link_names", explain: "Icon-only links (social icons, arrows) with no accessible name." },
    ],
    steps: [
      "Run the free check to find the basic issues listed above.",
      "Try using your site with only the keyboard (Tab and Enter). Can you reach and use everything?",
      "Fix alt text and form labels first. They're the most common and the easiest to fix.",
      "For a formal assessment, hire an accessibility specialist who tests against WCAG.",
    ],
    whenToGetHelp: "If you've received a demand letter or complaint, talk to a lawyer and an accessibility specialist promptly.",
    faq: [
      { q: "Does fixing these make us compliant?", a: "No single tool can certify compliance. These basics are a meaningful start, and a specialist can do a full WCAG review." },
      { q: "Are accessibility overlay widgets enough?", a: "They don't fix the underlying code issues. Fixing the site itself is the reliable approach." },
    ],
  },
  {
    slug: "should-i-redesign-my-dental-website",
    title: "Should I redesign my dental website, or just fix it?",
    description: "Thinking about a dental website redesign? How to decide between a redesign and targeted fixes, and what to check before paying for either.",
    intro:
      "A redesign is a big spend. Many 'we need a new website' problems turn out to be a handful of fixable issues: slow images, no tap-to-call, missing Google basics, broken links. Measure first, then decide.",
    causes: [
      { check: "server_response", explain: "Speed problems are usually hosting and images, not design." },
      { check: "tel_link", explain: "Conversion problems are often missing buttons, not the look." },
      { check: "title", explain: "Search problems are often missing SEO settings, not the theme." },
      { check: "viewport", explain: "A site that isn't responsive at all is a real reason to rebuild." },
      { check: "version_exposed", explain: "Very outdated software can be a reason to rebuild on a maintained platform." },
    ],
    steps: [
      "Run the free check and list what's actually wrong.",
      "Sort the issues into 'quick fixes' (settings, content, images) and 'structural' (not responsive, unmaintainable, very old platform).",
      "If most are quick fixes, fix them and re-measure in a month.",
      "If several are structural, a redesign is justified. Use the report as part of the brief so the new site fixes them.",
    ],
    whenToGetHelp: "If you go ahead with a redesign, insist on redirects from old URLs, keeping your page titles and content, and a post-launch check (a leftover noindex is a classic launch mistake).",
    faq: [
      { q: "How do I avoid losing Google rankings in a redesign?", a: "Keep URLs where possible, add 301 redirects for any that change, keep your best content, and check for noindex at launch." },
      { q: "Can you fix my current site instead?", a: "Yes. Our Fix-It service quotes a fixed price to fix the issues in your report." },
    ],
  },
  {
    slug: "how-much-does-a-dental-website-audit-cost",
    title: "How much does a dental website audit cost?",
    description: "What a dental website audit costs, what you should get for the money, and when a free check is enough.",
    intro:
      "Website audits range from free automated checks to agency reviews that can run from a few hundred to several thousand dollars. What matters is whether you get a prioritized list of fixes someone can actually act on.",
    causes: [
      { check: "tel_link", explain: "A good audit covers patient actions (calling, booking), not just technical SEO." },
      { check: "local_schema", explain: "It should check local SEO signals specific to practices." },
      { check: "server_response", explain: "It should measure speed and explain the cause." },
      { check: "img_alt", explain: "It should include accessibility basics." },
    ],
    steps: [
      "Start with a free check to see your score and top issues.",
      "If you have a web person, a prioritized fix list with step-by-step instructions is usually all you need.",
      "If you don't, get a fixed quote for the fixes rather than paying hourly.",
      "Re-check after fixes to confirm they're done.",
    ],
    whenToGetHelp: "For large multi-location groups or major migrations, a hands-on agency audit can be worth it. For a single practice site, an automated audit with clear fixes usually covers the important issues.",
    faq: [
      { q: "What does Enamel Audits cost?", a: "The check is free. The full report with every fix is $97 one-time (with a money-back guarantee), monitoring is $29/month, and Fix-It service starts at $497." },
      { q: "How long does an audit take?", a: "Ours takes about 30 seconds. The full report unlocks immediately after payment." },
    ],
  },
  {
    slug: "what-to-ask-your-dental-marketing-agency",
    title: "What to check before paying your dental marketing agency",
    description: "Paying monthly for dental website or SEO services? The basics your agency should have covered, and questions to ask before renewing.",
    intro:
      "Many practices pay a monthly fee for their website or SEO without knowing whether the basics are in place. A quick, independent check gives you a fair checklist to discuss with your agency.",
    causes: [
      { check: "title", explain: "Every key page should have a unique title with your service and town." },
      { check: "meta_description", explain: "Every key page should have a description written to earn clicks." },
      { check: "sitemap", explain: "A sitemap should exist and be submitted in Search Console." },
      { check: "local_schema", explain: "Dentist structured data should be present and match your Business Profile." },
      { check: "analytics", explain: "You should have access to analytics showing calls and bookings." },
      { check: "broken_links", explain: "There shouldn't be broken links to forms, specials or insurance pages." },
    ],
    steps: [
      "Run the free check and share the summary with your agency.",
      "Ask: who owns the domain, the website and the Google Analytics/Search Console accounts?",
      "Ask for a monthly report showing calls, bookings and form submissions, not just traffic.",
      "Agree on a timeline for fixing the issues in the report, then re-check.",
    ],
    whenToGetHelp: "If the agency can't give you access to your own accounts or won't address basic issues, it may be time to look elsewhere.",
    faq: [
      { q: "Is it awkward to audit my agency?", a: "A good agency welcomes a clear checklist. It makes their job easier and shows the value of their work." },
      { q: "What should I own?", a: "Your domain name, your website content and admin access, and your Google accounts (Business Profile, Analytics, Search Console)." },
    ],
  },
];

export const PROBLEM_BY_SLUG: Record<string, Problem> = Object.fromEntries(PROBLEMS.map((p) => [p.slug, p]));
