import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appUrl, BRAND, COMPANY, demoHref, mailto } from "@/lib/site";
import { BrandLogo, TOOTH_PATH } from "@/components/brand";
import { BTN_GHOST, BTN_PRIMARY, CONTAINER } from "./ui";

const LINKS = [
  {
    title: "Product",
    links: [
      ["Dental chart", "/#chart"],
      ["Features", "/#features"],
      ["A day at the clinic", "/#day"],
      ["Mobile apps", "/#apps"],
      ["FAQ", "/#faq"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy policy", "/privacy"],
      ["Delete your account", "/delete-account"],
    ],
  },
  {
    title: "Contact",
    links: [
      ["Book a demo", demoHref],
      ["Email us", mailto(`Question about ${BRAND}`)],
      ["Sign in", appUrl("/")],
    ],
  },
];

// The closing call to action, then the footer. `cta` is off on legal pages.
export function SiteFooter({ cta = true }) {
  return (
    <footer>
      {cta && (
        <section className="border-line relative overflow-hidden border-t py-24 sm:py-32">
          <svg
            className="text-mint pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[34rem] -translate-x-1/2 -translate-y-1/2"
            viewBox="10 6 80 108"
            aria-hidden="true"
          >
            <path d={TOOTH_PATH} fill="currentColor" />
          </svg>
          <div className={`${CONTAINER} hm-head text-center`}>
            <p className="hm-rise label text-muted">Ready when you are</p>
            <h2 className="hm-rise font-display mx-auto mt-5 max-w-3xl text-5xl leading-[1.02] sm:text-7xl">
              Open wide. <em className="text-brand-text italic">We&apos;ll take it from here.</em>
            </h2>
            <p className="hm-rise text-muted mx-auto mt-6 max-w-xl text-lg">
              Tell us about your clinic and we&apos;ll walk you through {BRAND} with your own chairs, doctors and price list.
            </p>
            <div className="hm-rise mt-9 flex flex-wrap justify-center gap-3">
              <a href={demoHref} className={BTN_PRIMARY}>
                Book a free demo <ArrowRight className="size-4" />
              </a>
              <a href={appUrl("/")} className={`${BTN_GHOST} bg-bg`}>
                Sign in
              </a>
            </div>
          </div>
        </section>
      )}

      <div className="border-line border-t">
        <div className={`${CONTAINER} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]`}>
          <div>
            <BrandLogo />
            <p className="text-muted mt-4 max-w-xs text-sm leading-relaxed">
              Dental practice management for Indian clinics: records, chairs, billing, accounts, lab work, recalls and
              leads, in one place.
            </p>
          </div>
          {LINKS.map((group) => (
            <div key={group.title}>
              <p className="label text-muted">{group.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("/") ? (
                      <Link href={href} className="hover:text-brand-text transition-colors">
                        {label}
                      </Link>
                    ) : (
                      <a href={href} className="hover:text-brand-text transition-colors">
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`${CONTAINER} border-line text-muted flex flex-wrap justify-between gap-3 border-t py-6 text-xs`}>
          <span>
            © {new Date().getFullYear()} {COMPANY}
          </span>
          <span>Made for dental clinics in India</span>
        </div>
      </div>
    </footer>
  );
}
