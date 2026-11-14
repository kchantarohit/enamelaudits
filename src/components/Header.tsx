import Link from "next/link";

export function Header() {
  return (
    <header className="no-print border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold text-brand-dark">
          Enamel Audits<span className="text-accent">.</span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold">
            <li className="hidden sm:block"><Link href="/#checks" className="hover:text-brand">What we check</Link></li>
            <li className="hidden sm:block"><Link href="/#pricing" className="hover:text-brand">Pricing</Link></li>
            <li className="hidden sm:block"><Link href="/guides" className="hover:text-brand">Guides</Link></li>
            <li><Link href="/#audit" className="btn btn-primary !px-4 !py-2 text-sm">Free check</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
