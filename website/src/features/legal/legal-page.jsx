import { SiteHeader } from "@/features/home/site-header";
import { SiteFooter } from "@/features/home/site-footer";
import { CONTAINER } from "@/features/home/ui";

// The frame for the privacy policy and other legal pages: the site header,
// a serif title, a contents list beside the text, and the footer.
export function LegalPage({ eyebrow, title, updated, toc = [], children }) {
  return (
    <>
      <SiteHeader />
      <main className="pt-32 pb-24 sm:pt-40">
        <div className={CONTAINER}>
          <div className="border-line max-w-3xl border-b pb-10">
            <p className="label text-muted flex items-center gap-3">
              <span className="bg-brand size-1.5 rounded-full" />
              {eyebrow}
            </p>
            <h1 className="font-display mt-5 text-5xl leading-[1.02] sm:text-6xl">{title}</h1>
            {updated && <p className="text-muted mt-5 text-sm">Last updated {updated}</p>}
          </div>

          <div className={`mt-12 grid gap-12 ${toc.length ? "lg:grid-cols-[13rem_minmax(0,1fr)]" : ""}`}>
            {toc.length > 0 && (
              <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
                <p className="label text-muted">On this page</p>
                <ol className="border-line mt-4 space-y-2 border-l pl-4 text-sm">
                  {toc.map(([id, label]) => (
                    <li key={id}>
                      <a href={`#${id}`} className="text-muted hover:text-ink transition-colors">
                        {label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <article className="legal max-w-3xl">{children}</article>
          </div>
        </div>
      </main>
      <SiteFooter cta={false} />
    </>
  );
}
