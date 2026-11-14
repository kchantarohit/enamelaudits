import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <p className="mt-3 text-muted">That page doesn&apos;t exist, or the report link is incomplete.</p>
      <Link href="/" className="btn btn-primary mt-6">Run a free website check</Link>
    </div>
  );
}
