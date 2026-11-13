import type { MetadataRoute } from "next";
import { CHECKS, guideSlug } from "@/lib/audit/catalog";
import { SITE } from "@/lib/site";
import { SPECIALTIES } from "@/content/specialties";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE.url}/tools/dentist-schema-generator`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...SPECIALTIES.map((s) => ({ url: `${SITE.url}/for/${s.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...CHECKS.map((c) => ({ url: `${SITE.url}/guides/${guideSlug(c.id)}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
