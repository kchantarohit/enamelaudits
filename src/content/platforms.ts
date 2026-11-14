export interface Platform {
  slug: string;
  name: string;
  managed: boolean;
  headline: string;
  description: string;
  intro: string;
  handledForYou: string[];
  fixes: { check: string; how: string }[];
  watchOut: string[];
  vendorEmail?: string;
}

/**
 * Platform-specific pages: same audit, different "how to fix it" depending on what
 * the practice's site is built with (the audit detects the platform automatically).
 * Menu names change over time, so instructions point to the setting, not exact clicks.
 */
export const PLATFORMS: Platform[] = [
  {
    slug: "wordpress",
    name: "WordPress",
    managed: false,
    headline: "WordPress dental website audit: what to check and how to fix it",
    description:
      "Free audit for dental practice websites built on WordPress. The WordPress-specific fixes for speed, noindex, SEO plugins, schema, tap-to-call and image sizes.",
    intro:
      "WordPress gives a practice complete control, which also means nothing is checked for you. How well a WordPress dental site performs depends on the theme, the plugins and the hosting your agency picked, and on whether anyone has kept them updated since launch.",
    handledForYou: [
      "Nothing is guaranteed: quality depends on your theme, plugins and host.",
      "Most modern themes are mobile-responsive and add a viewport tag.",
      "SEO plugins such as Yoast SEO or Rank Math, if installed, handle titles, descriptions, canonical tags and the sitemap.",
    ],
    fixes: [
      { check: "noindex", how: "Go to Settings → Reading and make sure \"Discourage search engines from indexing this site\" is unticked. Agencies often tick it while building the site and forget to switch it back at launch." },
      { check: "server_response", how: "Turn on page caching (your host's built-in cache, or a plugin such as WP Rocket, LiteSpeed Cache or W3 Total Cache), put the site behind Cloudflare, and delete plugins you no longer use. If it's still slow, budget shared hosting is usually the bottleneck." },
      { check: "image_weight", how: "Install an image-optimization plugin (for example ShortPixel, Imagify or Smush), run its bulk optimizer on the Media Library, and turn on WebP delivery. Re-upload the biggest team or office photos at around 2000 px wide." },
      { check: "title", how: "In Yoast SEO or Rank Math, set a unique SEO title for the home page and each service page: practice name, main service and town. Without an SEO plugin, the theme usually just uses the page name." },
      { check: "meta_description", how: "Edit each page and fill in the meta description field in the SEO plugin's panel below the editor. Aim for 120–155 characters with a reason to book." },
      { check: "sitemap", how: "Yoast and Rank Math generate /sitemap_index.xml automatically. WordPress itself also creates /wp-sitemap.xml. Submit whichever exists in Google Search Console." },
      { check: "local_schema", how: "Paste Dentist JSON-LD (use our free generator) into a header-scripts plugin, or use your SEO plugin's local business / schema settings. Make the details match your Google Business Profile exactly." },
      { check: "tel_link", how: "In the block editor, select the phone number, click the link button and enter tel:+15551234567 (country code, no spaces). Do the same in the header and footer widgets." },
      { check: "img_alt", how: "Open Media → Library, click each image and fill in Alternative Text. New uploads should get alt text as part of your routine." },
      { check: "version_exposed", how: "Update WordPress core, your theme and every plugin (Dashboard → Updates), and remove the generator tag with your security plugin. Updates are the real protection." },
    ],
    watchOut: [
      "Plugins that were installed for a one-off campaign and never removed",
      "Page builders that load a lot of CSS and scripts on every page",
      "Contact forms whose fields rely on placeholder text instead of labels",
      "Nobody on your team having admin access (make sure the practice owns the login)",
    ],
  },
  {
    slug: "wix",
    name: "Wix",
    managed: false,
    headline: "Wix dental website audit: fixing the issues Wix doesn't handle for you",
    description:
      "Free audit for dental websites built on Wix. What Wix handles automatically, and how to fix titles, descriptions, tap-to-call, booking, alt text and schema on a Wix site.",
    intro:
      "Wix takes care of hosting, security certificates and the sitemap, so the most common problems on Wix dental sites are content settings that were never filled in and apps or widgets that slow the page down.",
    handledForYou: [
      "HTTPS / SSL certificate",
      "An XML sitemap, generated automatically",
      "Hosting and server performance",
      "Mobile layouts (each page also has a separate mobile view you can adjust)",
    ],
    fixes: [
      { check: "title", how: "Open each page's settings in the Editor and go to its SEO section. Set a unique title with your practice name, main service and town, instead of the default page name." },
      { check: "meta_description", how: "In the same page SEO settings, write a meta description of 120–155 characters. Wix's SEO setup checklist will also prompt you for the home page." },
      { check: "tel_link", how: "Select the text or button showing your number, open the link settings and choose the Phone link type. Check the mobile view too: it can have different elements from the desktop view." },
      { check: "online_booking", how: "Add a booking button in the header that links to your scheduling system, or use the Wix Bookings app if you don't have one." },
      { check: "img_alt", how: "Click each image, open its settings and fill in the alt text field describing what's in the photo." },
      { check: "local_schema", how: "Wix lets you add structured data markup in a page's advanced SEO settings. Paste Dentist JSON-LD from our generator on the home page, matching your Google Business Profile." },
      { check: "page_requests", how: "Remove apps and widgets you don't use (chat, pop-ups, social feeds, old promotions). Each one adds scripts to every page." },
      { check: "address_visible", how: "Add your full address, phone and hours as text in the footer, not only as a map or image." },
    ],
    watchOut: [
      "The mobile view drifting out of sync with desktop (hidden elements, missing buttons)",
      "Large background videos or galleries on the home page",
      "Duplicate pages left over from templates (e.g. a demo 'Services' page)",
    ],
  },
  {
    slug: "squarespace",
    name: "Squarespace",
    managed: false,
    headline: "Squarespace dental website audit: the fixes that matter",
    description:
      "Free audit for dental practice websites on Squarespace. How to fix SEO titles, descriptions, tap-to-call links, booking, Dentist schema and image sizes on Squarespace.",
    intro:
      "Squarespace sites look polished out of the box, which can hide the practical problems: SEO fields left blank, phone numbers that aren't links, and huge photos uploaded straight from a photoshoot.",
    handledForYou: [
      "HTTPS / SSL certificate",
      "An XML sitemap at /sitemap.xml",
      "Responsive templates and hosting",
      "Automatic image resizing (though very large uploads still cost speed)",
    ],
    fixes: [
      { check: "title", how: "Open each page's settings, go to the SEO tab and set the SEO title: practice name, main service and town. Also check the site-wide title format in the SEO settings." },
      { check: "meta_description", how: "In each page's SEO tab, write a 120–155 character description. Set the home page's first." },
      { check: "tel_link", how: "Highlight the phone number, add a link and choose the phone option (tel:). Do it in the header, footer and contact page." },
      { check: "online_booking", how: "Add a 'Book appointment' button in the header linking to your scheduler. Squarespace's own scheduling tool is an option if you don't have one." },
      { check: "local_schema", how: "Fill in your business information in Squarespace's settings, then add full Dentist JSON-LD (from our generator) through Code Injection on plans that include it." },
      { check: "image_weight", how: "Re-export big photos at around 2000–2500 px wide and compress them before uploading. Avoid full-screen background videos on the home page." },
      { check: "img_alt", how: "Image blocks have a caption/alt text field; gallery images take alt text from their title or description. Describe what's in each photo." },
      { check: "analytics", how: "Squarespace has built-in analytics; you can also connect Google Analytics 4 in the external services / analytics settings." },
    ],
    watchOut: [
      "Hours and address living only in an image or a map block",
      "Forms with placeholder-only fields",
      "Announcement bars with expired offers",
    ],
  },
  {
    slug: "godaddy",
    name: "GoDaddy Website Builder",
    managed: false,
    headline: "GoDaddy Website Builder dental site audit: what to fix",
    description:
      "Free audit for dental practice websites built with GoDaddy's website builder. How to fix titles, descriptions, tap-to-call, booking, alt text and schema, and when to consider moving.",
    intro:
      "GoDaddy's builder makes it quick to get a practice online, but it offers less control than other platforms. Most fixes are still possible from its settings; a few (like custom security headers) usually aren't.",
    handledForYou: [
      "Hosting, and an SSL certificate on plans that include it",
      "Mobile layouts",
      "Basic SEO settings and a guided SEO setup",
    ],
    fixes: [
      { check: "title", how: "Use the site's SEO settings (GoDaddy's guided SEO setup) to set a page title with your practice name, main service and town for each page." },
      { check: "meta_description", how: "In the same SEO settings, write a 120–155 character description for the home page and key service pages." },
      { check: "tel_link", how: "Use a button or link set to the phone action for your number, especially in the header, so it's one tap on mobile." },
      { check: "online_booking", how: "Link a prominent 'Book appointment' button to your scheduler, or use GoDaddy's appointments feature if your plan includes it." },
      { check: "img_alt", how: "Open each image's settings and add a short description as its alt text." },
      { check: "local_schema", how: "If your plan allows an HTML/embed section, paste Dentist JSON-LD from our generator. If not, make sure your address, phone and hours appear as text and match your Google Business Profile." },
      { check: "https", how: "Check that SSL is active for your domain in your GoDaddy account and that the site redirects to https://." },
    ],
    watchOut: [
      "Limited control over speed and security headers",
      "Contact forms with placeholder-only fields",
      "If you need a lot of fixes the builder can't make, a move to WordPress, Wix or Squarespace can be worth pricing",
    ],
  },
  {
    slug: "duda",
    name: "Duda",
    managed: true,
    headline: "Duda dental website audit: what to ask your agency to fix",
    description:
      "Free audit for dental websites built on Duda, a platform many marketing agencies use. Which issues to check and a ready-to-send email asking your agency to fix them.",
    intro:
      "Duda is a website platform used mostly by marketing agencies, so if your dental site runs on Duda, an agency probably built it and holds the editor access. The platform can fix nearly everything an audit flags; the question is whether your agency has.",
    handledForYou: [
      "Hosting and SSL",
      "Responsive layouts",
      "Sitemaps and basic SEO settings (when your agency fills them in)",
    ],
    fixes: [
      { check: "title", how: "Your agency can set per-page SEO titles in the page settings. Ask for practice name, main service and town on each key page." },
      { check: "meta_description", how: "Ask for unique meta descriptions on the home page and every service page." },
      { check: "local_schema", how: "Duda can output business structured data from the site's business information. Ask your agency to make sure it's filled in, uses the Dentist type, and matches your Google Business Profile." },
      { check: "tel_link", how: "Ask for a click-to-call button in the mobile header." },
      { check: "online_booking", how: "Ask for a booking button in the header that goes straight to your scheduler." },
      { check: "page_requests", how: "Ask your agency to remove unused widgets and third-party scripts, which add weight to every page." },
    ],
    watchOut: [
      "Not having your own login (ask for at least view access)",
      "Paying monthly for SEO while basics like titles and schema are missing",
    ],
    vendorEmail:
      "Hi [agency], we ran our website ([domain]) through an audit and would like these items fixed:\n\n1. [issue 1 from your report]\n2. [issue 2]\n3. [issue 3]\n\nThe full report with step-by-step fixes is here: [report link]. Could you let us know a timeline? Thanks!",
  },
  {
    slug: "managed-dental-platforms",
    name: "managed dental website providers",
    managed: true,
    headline: "Audit for dental websites from managed providers (ProSites, Officite, PBHS and others)",
    description:
      "Free audit for practice websites hosted by managed dental website providers. What these providers typically handle, what to check yourself, and an email to request fixes.",
    intro:
      "Many practices use a provider that builds and hosts websites specifically for dentists, such as ProSites, Officite or PBHS. Hosting and updates are usually handled for you, and most changes go through the provider's support team or account manager. That makes a clear, prioritized list of what to change especially useful.",
    handledForYou: [
      "Hosting, security certificates and software updates (typically)",
      "Dental-specific page templates and patient-education content",
      "Changes on request through support or an account manager",
    ],
    fixes: [
      { check: "tel_link", how: "Ask for every phone number to be a tap-to-call link, and for a call button in the mobile header." },
      { check: "online_booking", how: "Ask for your online scheduling link (or an appointment-request form) as a button in the header on every page." },
      { check: "title", how: "Ask for unique page titles on the home page and each service page, including your town." },
      { check: "local_schema", how: "Ask whether Dentist structured data is included, and that it matches your Google Business Profile name, address, phone and hours exactly." },
      { check: "broken_links", how: "Send the list of broken links from your report. They're often old forms, specials or insurance pages." },
      { check: "analytics", how: "Make sure the practice owns (or at least has access to) the Google Analytics and Search Console accounts for the site." },
      { check: "copyright_year", how: "Ask for the footer year to update automatically." },
    ],
    watchOut: [
      "Shared template content that appears on many practices' sites word-for-word",
      "Not knowing who owns the domain name (make sure it's registered to the practice)",
      "Contract terms if you ever want to move providers",
    ],
    vendorEmail:
      "Hi [provider] support, please make the following changes to our website ([domain]):\n\n1. [issue 1 from your report]\n2. [issue 2]\n3. [issue 3]\n\nOur full audit with step-by-step details is here: [report link]. Please confirm when these are done so we can re-run the check. Thank you!",
  },
];

export const PLATFORM_BY_SLUG: Record<string, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.slug, p]));
