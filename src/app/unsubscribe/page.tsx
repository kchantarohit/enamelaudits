import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function Unsubscribe(props: PageProps<"/unsubscribe">) {
  const sp = await props.searchParams;
  const e = typeof sp.e === "string" ? sp.e : "";
  const t = typeof sp.t === "string" ? sp.t : "";
  if (sp.done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-3xl font-extrabold">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-muted">You won&apos;t receive any more emails from Enamel Audits. Sorry for the bother.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-extrabold">Unsubscribe from Enamel Audits emails?</h1>
      <p className="mt-3 text-muted">One click and we&apos;ll never email this address again.</p>
      <form method="post" action={`/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`} className="mt-6">
        <button type="submit" className="btn btn-primary">Unsubscribe me</button>
      </form>
    </div>
  );
}
