import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms & refunds", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <div className="prose-guide mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Terms of service &amp; refunds</h1>
      <p>Last updated: November 2026</p>
      <h2>The service</h2>
      <p>
        {SITE.name} provides automated reviews of publicly available web pages. Reports are informational. They are not legal advice, not an accessibility
        compliance audit, and not a HIPAA assessment. We don&apos;t guarantee any particular search ranking, traffic or patient outcome.
      </p>
      <h2>Use</h2>
      <p>Only check websites you own, manage, or have a legitimate interest in. Don&apos;t use the service to overload or attack any website. We rate-limit checks and make a small number of polite requests per check.</p>
      <h2>Payments</h2>
      <ul>
        <li>Full Health Report: ${SITE.reportPrice} one-time, unlocked immediately after payment, with {SITE.rescanLimit} free re-scans within 30 days.</li>
        <li>Monitoring: ${SITE.monitoringMonthly}/month or ${SITE.monitoringAnnual}/year, billed in advance until you cancel. Cancel anytime by emailing us; you keep access until the end of the paid period.</li>
        <li>Fix-It service: quoted individually; work begins only after you accept the quote.</li>
      </ul>
      <h2>Money-back guarantee</h2>
      <p>If your Full Health Report doesn&apos;t identify at least 3 actionable improvements, email {SITE.contactEmail} within 14 days of purchase for a full refund. For other refund requests, contact us and we&apos;ll do our best to make it right.</p>
      <h2>Contact</h2>
      <p>{SITE.name}, {SITE.address} · <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></p>
    </div>
  );
}
