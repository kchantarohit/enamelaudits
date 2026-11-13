import type { Metadata } from "next";
import Link from "next/link";
import { SchemaGenerator } from "./SchemaGenerator";

export const metadata: Metadata = {
  title: "Free Dentist Schema Generator (JSON-LD for Dental Practices)",
  description: "Generate Dentist structured data (JSON-LD) for your dental practice website in seconds. Free, no signup. Helps Google understand your name, address, phone and hours.",
  alternates: { canonical: "/tools/dentist-schema-generator" },
};

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Free Dentist schema generator</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        Fill in your practice details and copy the code into your website&apos;s &lt;head&gt;. It tells Google your name, address, phone and hours in a
        format it can read reliably. <Link className="underline" href="/guides/local-schema">Read the full guide</Link>.
      </p>
      <SchemaGenerator />
      <div className="card mt-10 p-6">
        <h2 className="text-xl font-extrabold">Is schema the only thing missing?</h2>
        <p className="mt-2 text-muted">Most practice websites have 10+ fixable issues. Run the free check to see your score and top issues in 30 seconds.</p>
        <Link href="/#audit" className="btn btn-primary mt-4">Check my website free</Link>
      </div>
    </div>
  );
}
