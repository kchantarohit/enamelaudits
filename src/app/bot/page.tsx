import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "About EnamelAuditsBot", robots: { index: false } };

export default function Bot() {
  return (
    <div className="prose-guide mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold">About EnamelAuditsBot</h1>
      <p>
        EnamelAuditsBot visits a website only when someone requests a health check of it. Each check loads the home page, robots.txt, sitemap, and up to
        about 50 linked files to test that they respond, with a short timeout and modest concurrency. It does not crawl the whole site, log in, or submit forms.
      </p>
      <p>To ask us not to check your site, email <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
    </div>
  );
}
