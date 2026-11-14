"use client";

import { useId, useMemo, useState } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Hours = Record<string, { open: string; close: string; on: boolean }>;

export function SchemaGenerator() {
  const uid = useId();
  const [f, setF] = useState({
    name: "", url: "", phone: "", street: "", city: "", region: "", postal: "", country: "US", image: "", priceRange: "$$", sameAs: "",
  });
  const [hours, setHours] = useState<Hours>(() =>
    Object.fromEntries(DAYS.map((d, i) => [d, { open: "08:00", close: "17:00", on: i < 5 }])),
  );
  const [copied, setCopied] = useState(false);

  const json = useMemo(() => {
    const obj: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Dentist",
      name: f.name || "Your Practice Name",
      url: f.url || undefined,
      telephone: f.phone || undefined,
      image: f.image || undefined,
      priceRange: f.priceRange || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: f.street || undefined,
        addressLocality: f.city || undefined,
        addressRegion: f.region || undefined,
        postalCode: f.postal || undefined,
        addressCountry: f.country || undefined,
      },
      openingHoursSpecification: DAYS.filter((d) => hours[d].on).map((d) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: d,
        opens: hours[d].open,
        closes: hours[d].close,
      })),
      sameAs: f.sameAs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    };
    if (!(obj.sameAs as string[]).length) delete obj.sameAs;
    return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
  }, [f, hours]);

  const field = (key: keyof typeof f, label: string, placeholder = "", type = "text") => (
    <div>
      <label htmlFor={`${uid}-${key}`} className="block text-sm font-semibold">{label}</label>
      <input
        id={`${uid}-${key}`} type={type} placeholder={placeholder} value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        className="mt-1 w-full rounded-lg border border-slate-400 px-3 py-2"
      />
    </div>
  );

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <div className="card space-y-3 p-5">
        {field("name", "Practice name", "Bright Smile Dental")}
        {field("url", "Website", "https://www.brightsmile.com", "url")}
        {field("phone", "Phone", "+1-555-123-4567", "tel")}
        {field("street", "Street address", "123 Main St, Suite 200")}
        <div className="grid grid-cols-2 gap-3">
          {field("city", "City", "Springfield")}
          {field("region", "State / region", "IL")}
          {field("postal", "ZIP / postal code", "62701")}
          {field("country", "Country code", "US")}
        </div>
        {field("image", "Logo or office photo URL", "https://www.brightsmile.com/logo.png", "url")}
        {field("priceRange", "Price range", "$$")}
        <div>
          <label htmlFor={`${uid}-sameAs`} className="block text-sm font-semibold">Profiles (Google, Facebook, Yelp), one per line</label>
          <textarea id={`${uid}-sameAs`} rows={3} value={f.sameAs} onChange={(e) => setF({ ...f, sameAs: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-400 px-3 py-2" />
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Opening hours</legend>
          <div className="mt-2 space-y-1">
            {DAYS.map((d) => (
              <div key={d} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={hours[d].on} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], on: e.target.checked } })} />
                  {d.slice(0, 3)}
                </label>
                <input aria-label={`${d} opens`} type="time" value={hours[d].open} disabled={!hours[d].on} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], open: e.target.value } })} className="rounded border border-slate-300 px-2 py-1" />
                <input aria-label={`${d} closes`} type="time" value={hours[d].close} disabled={!hours[d].on} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], close: e.target.value } })} className="rounded border border-slate-300 px-2 py-1" />
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Your code</h2>
          <button
            type="button"
            className="btn btn-primary !py-2 text-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(json).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
        </div>
        <pre className="mt-3 max-h-[36rem] overflow-auto rounded-lg bg-[#0f1c2a] p-4 text-xs text-slate-100"><code>{json}</code></pre>
        <p className="mt-3 text-sm text-muted">
          Paste it into your site&apos;s &lt;head&gt; (WordPress: use a header-scripts plugin or your SEO plugin&apos;s schema settings), then test it with Google&apos;s Rich Results Test.
          Make sure the details exactly match your Google Business Profile.
        </p>
      </div>
    </div>
  );
}
