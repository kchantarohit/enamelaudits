export interface Specialty {
  slug: string;
  singular: string;
  plural: string;
  headline: string;
  intro: string;
  patientMoment: string;
  priorities: { check: string; reason: string }[];
  extra: string[];
}

/** Programmatic landing pages: one per practice type, each with its own angle. */
export const SPECIALTIES: Specialty[] = [
  {
    slug: "general-dentists",
    singular: "general dentist",
    plural: "General dentists",
    headline: "Website health check for general & family dental practices",
    intro: "Family practices live on a steady flow of new patients: parents booking for the whole family, people who just moved to town, and patients switching insurance. Your website is usually their first impression, and they compare you against two or three other practices in the same search.",
    patientMoment: "A parent who just moved to your area searches 'family dentist near me' on their phone while the kids are in the bath. They want to know if you take their insurance, whether you see children, and how to book without calling during work hours.",
    priorities: [
      { check: "insurance_info", reason: "Insurance is the first filter family patients use." },
      { check: "online_booking", reason: "Parents often book in the evening, after office hours." },
      { check: "tel_link", reason: "Most first contact still happens by phone, from a mobile." },
      { check: "new_patients", reason: "A clear first-visit page reduces no-shows and anxiety." },
    ],
    extra: [
      "Do you list the ages you see and whether you're family-friendly?",
      "Is your hygiene/cleaning booking as easy as a new-patient exam?",
      "Do your service pages (crowns, fillings, whitening) load fast on phones?",
    ],
  },
  {
    slug: "orthodontists",
    singular: "orthodontist",
    plural: "Orthodontists",
    headline: "Website health check for orthodontic practices",
    intro: "Orthodontic patients research for weeks before booking a consultation. Parents compare practices, adults compare Invisalign providers, and the practice with the clearest, fastest, most trustworthy website often gets the free consult.",
    patientMoment: "A parent is comparing three orthodontists for their 12-year-old. They want before-and-after results, a sense of cost and payment plans, and an easy way to request the free consultation.",
    priorities: [
      { check: "online_booking", reason: "The free-consult request is your most valuable conversion." },
      { check: "insurance_info", reason: "Payment plans and financing are a deciding factor for ortho." },
      { check: "image_weight", reason: "Before-and-after galleries are often huge, slow image files." },
      { check: "reviews", reason: "Parents lean heavily on other parents' reviews." },
    ],
    extra: [
      "Is 'Free consultation' visible on the first screen on a phone?",
      "Do Invisalign and braces have their own fast-loading pages?",
      "Are financing options (monthly payment plans) explained clearly?",
    ],
  },
  {
    slug: "pediatric-dentists",
    singular: "pediatric dentist",
    plural: "Pediatric dentists",
    headline: "Website health check for pediatric dental practices",
    intro: "Pediatric practices are chosen by parents, often in a hurry and almost always on a phone. Trust, warmth, and an effortless path to booking matter more than anywhere else in dentistry.",
    patientMoment: "A parent's toddler chipped a tooth at the playground. They search 'kids dentist near me', need to know if you take same-day appointments, and want to call with one tap.",
    priorities: [
      { check: "tel_link", reason: "Worried parents call. The number must be one tap away." },
      { check: "hours", reason: "Parents need to know immediately if you're open today." },
      { check: "server_response", reason: "Parents on the go won't wait for a slow page." },
      { check: "new_patients", reason: "First-visit info reassures nervous parents (and kids)." },
    ],
    extra: [
      "Do you explain what happens at a child's first visit?",
      "Is emergency or same-day availability clearly stated?",
      "Are forms easy to complete on a phone?",
    ],
  },
  {
    slug: "cosmetic-dentists",
    singular: "cosmetic dentist",
    plural: "Cosmetic dentists",
    headline: "Website health check for cosmetic dental practices",
    intro: "Cosmetic dentistry is a high-value, considered purchase. Patients browse smile galleries, read reviews, and judge your attention to detail by your website. A slow, dated site undermines the very aesthetic quality you're selling.",
    patientMoment: "Someone planning a wedding is researching veneers late at night. They'll browse your smile gallery, look for pricing or financing, and request a consultation if everything feels premium.",
    priorities: [
      { check: "image_weight", reason: "Smile galleries are usually the slowest part of cosmetic sites." },
      { check: "reviews", reason: "Social proof is essential for elective, high-ticket treatment." },
      { check: "online_booking", reason: "Consult requests often happen outside office hours." },
      { check: "open_graph", reason: "Cosmetic patients share results; previews should look great." },
    ],
    extra: [
      "Do your before-and-after images load quickly on mobile data?",
      "Is financing (e.g. monthly payments) visible on veneer and whitening pages?",
      "Does your site feel as polished as the results you deliver?",
    ],
  },
  {
    slug: "dental-implant-centers",
    singular: "dental implant practice",
    plural: "Implant practices",
    headline: "Website health check for dental implant practices",
    intro: "Implant cases are among the most valuable in dentistry, and patients research them carefully. Many are older, which makes readability, zoom, and clear phone numbers even more important.",
    patientMoment: "A 64-year-old researching full-arch implants reads your site on a tablet with reading glasses. They want clear costs or financing, credentials, and to call you directly.",
    priorities: [
      { check: "zoom_enabled", reason: "Older patients rely on pinch-to-zoom to read." },
      { check: "tel_link", reason: "Implant patients prefer to talk to a person first." },
      { check: "insurance_info", reason: "Financing determines whether many cases go ahead." },
      { check: "local_schema", reason: "Helps you appear for 'dental implants near me' searches." },
    ],
    extra: [
      "Is text large and high-contrast enough for older eyes?",
      "Do you explain the process and timeline in plain English?",
      "Is a free consultation or CT scan offer easy to find?",
    ],
  },
  {
    slug: "oral-surgeons",
    singular: "oral surgeon",
    plural: "Oral surgeons",
    headline: "Website health check for oral & maxillofacial surgery practices",
    intro: "Oral surgery practices get patients from two directions: referring dentists and patients searching directly. Both need fast access to referral forms, directions, and phone numbers, often under stress.",
    patientMoment: "A patient referred for wisdom tooth removal looks you up after the referral. They need your address, parking info, pre-op instructions, and a clear phone number.",
    priorities: [
      { check: "address_visible", reason: "Referred patients need to find you, quickly." },
      { check: "map", reason: "Directions and parking reduce late arrivals." },
      { check: "broken_links", reason: "Broken referral or pre-op form links cause real problems." },
      { check: "form_labels", reason: "Referral forms must be usable by everyone." },
    ],
    extra: [
      "Is there an easy, working referral form for dentists?",
      "Are pre- and post-op instructions easy to find on a phone?",
      "Is sedation and anesthesia information clear?",
    ],
  },
  {
    slug: "periodontists",
    singular: "periodontist",
    plural: "Periodontists",
    headline: "Website health check for periodontal practices",
    intro: "Periodontal patients are often referred, worried, and searching for reassurance about gum treatment. Clear explanations and trust signals matter, and so does making the next step obvious.",
    patientMoment: "A patient told they need gum grafting searches for a specialist. They want to understand the procedure, check credentials and reviews, and book a consult.",
    priorities: [
      { check: "reviews", reason: "Reassurance from other patients reduces procedure anxiety." },
      { check: "new_patients", reason: "Referred patients want to know what to expect." },
      { check: "title", reason: "Specialist searches depend on clear titles: 'Periodontist in [town]'." },
      { check: "local_schema", reason: "Helps Google connect your site to local specialist searches." },
    ],
    extra: [
      "Do treatment pages explain procedures in plain English?",
      "Is there a referral path for general dentists?",
      "Is the practice's specialist status obvious in search results?",
    ],
  },
  {
    slug: "endodontists",
    singular: "endodontist",
    plural: "Endodontists",
    headline: "Website health check for endodontic practices",
    intro: "Endodontic patients are frequently in pain. They need to know, within seconds, whether you can see them soon and how to reach you. Speed and clarity on mobile are everything.",
    patientMoment: "Someone with a throbbing tooth at 7am searches 'root canal specialist near me'. They will call the first practice that loads fast and shows a tappable number.",
    priorities: [
      { check: "server_response", reason: "Patients in pain won't wait for a slow site." },
      { check: "tel_link", reason: "Emergency patients call; make it one tap." },
      { check: "hours", reason: "'Are they open now?' is the first question." },
      { check: "viewport", reason: "Nearly all emergency searches happen on phones." },
    ],
    extra: [
      "Is emergency availability stated on the first screen?",
      "Is there a fast way for referring dentists to send cases?",
      "Do you explain what a root canal involves to calm nervous patients?",
    ],
  },
  {
    slug: "emergency-dentists",
    singular: "emergency dental practice",
    plural: "Emergency dentists",
    headline: "Website health check for emergency dental practices",
    intro: "Emergency dental patients don't browse. They're in pain, on a phone, often outside office hours, and they call the first practice that loads quickly and makes it obvious they can be seen today.",
    patientMoment: "Someone cracks a tooth on a Saturday morning and searches 'emergency dentist near me'. They'll tap the first result that loads fast, says 'same-day appointments' and lets them call with one tap.",
    priorities: [
      { check: "tel_link", reason: "Emergency patients call. The number must be tappable and in the mobile header." },
      { check: "server_response", reason: "A blank screen for a few seconds sends a patient in pain straight back to Google." },
      { check: "hours", reason: "'Are they open right now?' is the first question; weekend and after-hours info must be visible." },
      { check: "noindex", reason: "Emergency pages that aren't indexed can't be found when it matters most." },
    ],
    extra: [
      "Does your home page say 'same-day emergency appointments' above the fold?",
      "Is there an after-hours number or instructions for weekends?",
      "Does your emergency page have its own title, e.g. 'Emergency Dentist in [Town]'?",
    ],
  },
  {
    slug: "prosthodontists",
    singular: "prosthodontist",
    plural: "Prosthodontists",
    headline: "Website health check for prosthodontic practices",
    intro: "Prosthodontic cases (dentures, implants, full-mouth reconstruction) are complex and high-value. Patients and referring dentists research carefully, so your site needs to explain the specialty clearly, load well on any device, and make consultations easy to request.",
    patientMoment: "A patient told they need full-mouth reconstruction looks you up after a referral. They want to understand what a prosthodontist does, see results, check financing, and book a consultation.",
    priorities: [
      { check: "insurance_info", reason: "Financing and insurance are central to whether complex cases go ahead." },
      { check: "image_weight", reason: "Before-and-after galleries are often the heaviest part of the site." },
      { check: "online_booking", reason: "Consultation requests should be easy from any page." },
      { check: "zoom_enabled", reason: "Many denture and implant patients are older and rely on pinch-to-zoom." },
    ],
    extra: [
      "Do you explain what a prosthodontist is, and how it differs from a general dentist?",
      "Is there a clear path for referring dentists?",
      "Are your credentials and case examples easy to find?",
    ],
  },
  {
    slug: "sedation-dentists",
    singular: "sedation dentistry practice",
    plural: "Sedation dentists",
    headline: "Website health check for sedation dentistry practices",
    intro: "Anxious patients often research for a long time before they book. Reassurance, clarity and a low-pressure way to get in touch matter more than anywhere else, and so does a site that feels trustworthy and current.",
    patientMoment: "Someone who hasn't seen a dentist in ten years because of anxiety reads your site late at night. They want to know what sedation options exist, whether it's safe, what it costs, and whether they can ask a question without phoning.",
    priorities: [
      { check: "contact_form", reason: "Anxious patients often prefer sending a message to making a call." },
      { check: "reviews", reason: "Stories from other nervous patients are the strongest reassurance." },
      { check: "https", reason: "A 'Not secure' warning is the last thing an anxious patient needs to see." },
      { check: "copyright_year", reason: "An out-of-date footer undermines trust in everything else on the page." },
    ],
    extra: [
      "Do you explain each sedation option in plain, calm language?",
      "Is there a gentle 'ask a question' option alongside booking?",
      "Is pricing or financing for sedation explained?",
    ],
  },
  {
    slug: "multi-location-dental-groups",
    singular: "multi-location dental group",
    plural: "Multi-location dental groups",
    headline: "Website health check for multi-location dental groups and DSOs",
    intro: "With several offices, small website issues multiply: one wrong phone number, one location missing from Google, one broken booking link per office. A consistent check across locations catches what manual reviews miss.",
    patientMoment: "A patient searches 'dentist near me' and lands on your group's site. They need to find the closest office, its hours and phone number, and book at that location, without getting lost.",
    priorities: [
      { check: "local_schema", reason: "Each location needs accurate structured data that matches its own Business Profile." },
      { check: "address_visible", reason: "Every office's address must be clear, consistent and correct." },
      { check: "broken_links", reason: "Location pages and booking links break as offices open, move or close." },
      { check: "online_booking", reason: "Booking should go to the right office's schedule." },
    ],
    extra: [
      "Does every location have its own page with unique title, address, phone and hours?",
      "Do your location pages match each office's Google Business Profile exactly?",
      "Monitoring tip: run the check on each location page monthly to catch drift.",
    ],
  },
];

export const SPECIALTY_BY_SLUG: Record<string, Specialty> = Object.fromEntries(SPECIALTIES.map((s) => [s.slug, s]));
