export const SITE = {
  name: "Enamel Audits",
  tagline: "Website health reports for dental practices",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://enamelaudits.vercel.app").replace(/\/$/, ""),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "kchantarohit@gmail.com",
  address: "136 Sukhumvit St, Pattaya, Chonburi 20150 Thailand",
  reportPrice: 97,
  monitoringMonthly: 29,
  monitoringAnnual: 290,
  fixItFrom: 497,
  rescanLimit: 2,
} as const;

export const CATEGORY_META = {
  speed: { label: "Speed", weight: 15, blurb: "How fast your site responds and how heavy it is." },
  security: { label: "Security", weight: 15, blurb: "HTTPS, certificate, and protective headers." },
  seo: { label: "Google basics", weight: 20, blurb: "What Google needs to list your practice properly." },
  mobile: { label: "Mobile", weight: 10, blurb: "Whether the site is set up for phones." },
  accessibility: { label: "Accessibility basics", weight: 10, blurb: "Alt text, labels, and other basics." },
  patient: { label: "Patient actions", weight: 15, blurb: "Can a new patient call, book, and trust you?" },
  local: { label: "Local SEO", weight: 10, blurb: "Signals that help you show up in local search." },
  links: { label: "Broken links", weight: 5, blurb: "Links that lead nowhere." },
} as const;

export type Category = keyof typeof CATEGORY_META;
export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as Category[];
