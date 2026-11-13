import type { Metadata } from "next";
import { ThanksPoller } from "./ThanksPoller";

export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

export default async function ThanksPage(props: PageProps<"/thanks">) {
  const sp = await props.searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : "";
  const audit = typeof sp.audit === "string" ? sp.audit : "";
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold">Thank you! Payment received.</h1>
      <ThanksPoller sessionId={sessionId} audit={audit} />
    </div>
  );
}
