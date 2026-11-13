// Generates content/x-posts.json and checks X's 280-char limit (links count as 23 chars).
import fs from "node:fs";
const L = (slug) => `https://enamelaudits.vercel.app/guides/${slug}?ref=x`;
const HOME = "https://enamelaudits.vercel.app/?ref=x";
const posts = [
  ["tel", "Dentists: tap your own phone number on your website, on your phone.\n\nIf it doesn't offer to call, every mobile patient has to copy it by hand. That's a 2-minute fix:", L("tel-link")],
  ["noindex", "A redesign can leave a 'noindex' tag behind, which tells Google to hide the site.\n\nIt happens more than you'd think. 30-second check for your dental website:", L("noindex")],
  ["booking", "Lots of people look for a dentist at 9pm on their couch.\n\nIf the only way to book is calling during office hours, they pick a practice where they can book now.", L("online-booking")],
  ["speed", "Open your practice website on your phone using mobile data, not office Wi-Fi.\n\nBlank screen for 2+ seconds? That's where patients hit 'back'. The usual fixes:", L("server-response")],
  ["title", "Your page title is the blue headline Google shows for your practice.\n\nFormula that works: Practice Name | Service + Town\n\ne.g. 'Bright Smile Dental | Family Dentist in Springfield'", L("title")],
  ["schema", "Google trusts what it can read reliably.\n\nDentist schema = a hidden summary of your name, address, phone and hours. Free generator, no signup:", "https://enamelaudits.vercel.app/tools/dentist-schema-generator?ref=x"],
  ["https", "If your dental website says 'Not secure' in the address bar, patients see that right next to your name.\n\nFree SSL + one redirect fixes it:", L("https")],
  ["zoom", "Some dental websites block pinch-to-zoom on phones.\n\nOlder patients, the ones booking implants and crowns, are exactly who need it. One-line fix:", L("zoom-enabled")],
  ["metadesc", "Search your practice on Google and read the grey text under your listing.\n\nIf it's a cookie notice or menu items, you're missing a meta description. Examples that get clicks:", L("meta-description")],
  ["insurance", "'Do they take my insurance?' is the #1 question new dental patients have.\n\nIf your website doesn't answer it, many won't bother calling to ask.", L("insurance-info")],
  ["images", "That beautiful 4 MB team photo on your home page? On mobile data it can take longer to load than everything else combined.\n\nHow to shrink it without losing quality:", L("image-weight")],
  ["sitemap", "No sitemap = Google may take ages to find your implant, Invisalign and emergency pages.\n\nMost WordPress SEO plugins make one automatically. Check yours:", L("sitemap")],
  ["copyright", "Scroll to the bottom of your practice website.\n\nIf it still says © 2019, patients wonder what else is out of date: hours, insurance, team. Fix it permanently:", L("copyright-year")],
  ["alt", "Missing alt text is the most common accessibility gap on dental websites.\n\nGood: 'Dr. Patel greeting a patient at the front desk'\nBad: 'IMG_2231.jpg'", L("img-alt")],
  ["labels", "Appointment forms with grey placeholder text and no labels: the hint disappears as soon as patients start typing.\n\nLabel every field. Bookings go up, frustration goes down.", L("form-labels")],
  ["newpatients", "Your most valuable visitor is a new patient deciding between you and two other practices.\n\nA clear 'New Patients' page wins that comparison. What to include:", L("new-patients")],
  ["analytics", "Paying for a dental website without analytics is like advertising without knowing if the phone rings.\n\nTrack calls, booking clicks and forms, but never patient health data.", L("analytics")],
  ["hours", "'Are they open now?' is the first question an emergency patient has.\n\nIf your hours are hidden on an inner page, you lose them to the practice that shows them up front.", L("hours")],
  ["robots", "One line in robots.txt, 'Disallow: /', can remove a whole dental website from Google.\n\nVisit yourpractice.com/robots.txt right now. Safe template:", L("robots-txt")],
  ["broken", "Broken links on a dental website usually point to insurance pages, forms, or old specials.\n\nPatients hit 'Page not found' right when they're ready to act.", L("broken-links")],
  ["privacy", "Running ads to your dental website? Most platforms expect a privacy policy link.\n\nIt also builds trust. How it differs from your Notice of Privacy Practices:", L("privacy-policy")],
  ["reviews", "You have 200 five-star Google reviews. Your website shows zero of them.\n\nPut real patient reviews on the home page, where people are deciding.", L("reviews")],
  ["checker", "We built a free dental website checker: 44 checks (speed, security, Google basics, mobile, tap-to-call, booking, local SEO).\n\nYour score + top issues in about 30 seconds, no login:", HOME],
  ["checker2", "Before you pay for a dental website redesign, find out what's actually wrong.\n\nA lot of 'we need a new site' turns out to be 6 fixable issues. Free check:", HOME],
];
const tLen = (s) => s.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
const out = posts.map(([id, body, link]) => {
  const text = `${body}\n\n${link}`;
  if (tLen(text) > 280) throw new Error(`${id} is ${tLen(text)} chars`);
  return { id, text };
});
fs.writeFileSync(new URL("./x-posts.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.length} posts OK; longest ${Math.max(...out.map((o) => tLen(o.text)))} chars`);
