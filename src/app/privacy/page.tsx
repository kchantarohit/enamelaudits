import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <div className="prose-guide mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Privacy policy</h1>
      <p>Last updated: November 2026</p>
      <h2>What we collect</h2>
      <ul>
        <li>The website address you ask us to check, and the publicly available content of that website at the time of the check.</li>
        <li>Your email address and practice name, if you choose to provide them.</li>
        <li>A one-way hashed form of your IP address, used only to prevent abuse of the free check.</li>
        <li>Payment details are handled entirely by Stripe. We receive your name, email and payment status, never your card number.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run your website check, show you your report and, if you ask, email you a link to it.</li>
        <li>To deliver paid reports and monthly monitoring reports you have purchased.</li>
        <li>To compile anonymous, aggregate statistics (for example, how many practice websites lack a sitemap). These never identify you or your practice.</li>
      </ul>
      <p>We do not sell your information. We do not collect any patient or health information; our checks only look at public web pages.</p>
      <h2>Who can see your report</h2>
      <p>Reports live at a private, hard-to-guess link. Anyone you share the link with can view it. Ask us and we will delete it.</p>
      <h2>Service providers</h2>
      <p>We use Vercel (hosting), Supabase (database) and Stripe (payments) to run this service.</p>
      <h2>Your choices</h2>
      <p>Email <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> to access, correct or delete your information, or to unsubscribe from any email.</p>
      <p>{SITE.name}, {SITE.address}</p>
    </div>
  );
}
