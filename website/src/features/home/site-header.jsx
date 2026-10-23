"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { appUrl, demoHref } from "@/lib/site";
import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { BTN_PRIMARY } from "./ui";

export const NAV = [
  ["Chart", "/#chart"],
  ["Features", "/#features"],
  ["A day", "/#day"],
  ["Apps", "/#apps"],
  ["FAQ", "/#faq"],
];

// A thin bar that gains a background and a rule once the page scrolls.
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || open ? "bg-bg/85 border-line border-b backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="DentXCloud home">
          <BrandLogo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Sections">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="text-muted hover:text-ink transition-colors">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted hover:text-ink hover:bg-sunken" />
          <a href={appUrl("/")} className="text-muted hover:text-ink hidden px-2 text-sm transition-colors sm:inline">
            Sign in
          </a>
          <a href={demoHref} className={`${BTN_PRIMARY} hidden h-9 px-4 sm:inline-flex`}>
            Book a demo
          </a>
          <button
            type="button"
            className="hover:bg-sunken flex size-9 items-center justify-center rounded-full md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-line border-t px-5 pt-2 pb-6 md:hidden" aria-label="Menu">
          <ul>
            {NAV.map(([label, href]) => (
              <li key={href} className="border-line border-b">
                <a href={href} onClick={() => setOpen(false)} className="font-display block py-3 text-2xl">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <a href={appUrl("/")} className="border-line-strong flex h-11 items-center justify-center rounded-full border text-sm font-medium">
              Sign in
            </a>
            <a href={demoHref} className={BTN_PRIMARY}>
              Book a demo
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
