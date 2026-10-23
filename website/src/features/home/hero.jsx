"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, CheckCheck, MessageCircle, ReceiptIndianRupee } from "lucide-react";
import { demoHref } from "@/lib/site";
import { BTN_GHOST, BTN_PRIMARY, CONTAINER } from "./ui";

// The day on the sample chair board. Stages: booked → waiting → in chair → done.
const ROWS = [
  { id: 1, time: "09:30", name: "Riya Sharma", what: "Scaling", chair: 1, stage: 3, wait: 0 },
  { id: 2, time: "10:00", name: "Arjun Kapoor", what: "Root canal · 36", chair: 2, stage: 2, wait: 0 },
  { id: 3, time: "10:15", name: "Meera Pillai", what: "Braces review", chair: 3, stage: 1, wait: 6 },
  { id: 4, time: "10:30", name: "Imran Shaikh", what: "Crown fitting · 26", chair: 1, stage: 1, wait: 2 },
  { id: 5, time: "10:45", name: "Sneha Rao", what: "Consultation", chair: 4, stage: 0, wait: 0 },
  { id: 6, time: "11:00", name: "Vikram Joshi", what: "Extraction · 48", chair: 2, stage: 0, wait: 0 },
];

const STAGES = [
  { label: "Booked", pill: "bg-sky-wash text-ink", dot: "bg-sky" },
  { label: "Waiting", pill: "bg-amber-wash text-ink", dot: "bg-amber" },
  { label: "In chair", pill: "bg-mint text-brand-text", dot: "bg-brand" },
  { label: "Done", pill: "bg-sunken text-muted", dot: "bg-line-strong" },
];

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// A working miniature of the chair board: patients move through the day,
// waiting times tick up and the clock runs.
function ChairBoard() {
  const [rows, setRows] = useState(ROWS);
  const [now, setNow] = useState(10 * 60 + 42);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let turn = 0;
    const step = setInterval(() => {
      if (document.hidden) return;
      const index = turn++ % ROWS.length;
      setRows((current) =>
        current.map((row, i) => (i === index ? { ...row, stage: (row.stage + 1) % STAGES.length, wait: 0 } : row)),
      );
    }, 2400);
    const tick = setInterval(() => {
      if (document.hidden) return;
      setRows((current) => current.map((row) => (row.stage === 1 ? { ...row, wait: row.wait + 1 } : row)));
      setNow((n) => (n + 1 >= 13 * 60 ? 10 * 60 + 42 : n + 1));
    }, 1500);
    return () => {
      clearInterval(step);
      clearInterval(tick);
    };
  }, []);

  const count = (stage) => rows.filter((row) => row.stage === stage).length;
  const busy = new Set(rows.filter((row) => row.stage === 2).map((row) => row.chair));

  return (
    <div className="bg-surface border-line shadow-float overflow-hidden rounded-2xl border" aria-hidden="true">
      {/* Window bar */}
      <div className="border-line bg-sunken flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="bg-line-strong size-2.5 rounded-full" />
          <span className="bg-line-strong size-2.5 rounded-full" />
          <span className="bg-line-strong size-2.5 rounded-full" />
        </span>
        <span className="text-muted truncate text-xs">Chair board · Andheri clinic</span>
        <span className="label text-muted ml-auto tabular-nums">{clock(now)}</span>
      </div>

      <div className="p-4 sm:p-5">
        {/* Chairs */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((chair) => (
            <div
              key={chair}
              className={`rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
                busy.has(chair) ? "bg-mint border-mint-strong" : "border-line"
              }`}
            >
              <p className="label text-muted">Chair {chair}</p>
              <p className={`mt-1 text-sm font-medium ${busy.has(chair) ? "text-brand-text" : "text-muted"}`}>
                {busy.has(chair) ? "In use" : "Free"}
              </p>
            </div>
          ))}
        </div>

        {/* Counts */}
        <div className="text-muted mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {[1, 2, 3].map((stage) => (
            <span key={stage} className="flex items-center gap-1.5">
              <span className={`${STAGES[stage].dot} size-2 rounded-full`} />
              {STAGES[stage].label} <span className="text-ink font-medium tabular-nums">{count(stage)}</span>
            </span>
          ))}
        </div>

        {/* Appointments */}
        <ul className="border-line mt-3 divide-y divide-[var(--line)] border-t">
          {rows.map((row) => {
            const stage = STAGES[row.stage];
            return (
              <li key={row.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                <span className="text-muted text-xs tabular-nums">{row.time}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${row.stage === 3 ? "text-muted line-through" : ""}`}>
                    {row.name}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {row.what} · Chair {row.chair}
                  </span>
                </span>
                <span
                  className={`${stage.pill} inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors duration-500`}
                >
                  {row.stage === 3 && <Check className="size-3" />}
                  {row.stage === 1 ? `Waiting ${row.wait} min` : stage.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      {/* A soft mint glow behind the board */}
      <div
        className="pointer-events-none absolute -top-40 right-[-20%] -z-10 size-[56rem] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--mint), transparent)" }}
        aria-hidden="true"
      />

      <div className={`${CONTAINER} grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12`}>
        <div>
          <p className="hm-hero-in label text-muted flex items-center gap-2">
            <span className="bg-brand size-1.5 rounded-full" />
            Dental practice software, made for India
          </p>
          <h1 className="hm-hero-in font-display mt-6 text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.6rem]">
            The calm way to run a <em className="text-brand-text italic">busy</em> dental clinic.
          </h1>
          <p className="hm-hero-in text-muted mt-6 max-w-xl text-lg leading-relaxed">
            Patient records, chair scheduling, GST billing, the cash book, inventory, lab work, WhatsApp recalls and a
            leads CRM, in one place. One login for the whole practice, from the front desk to the chair.
          </p>
          <div className="hm-hero-in mt-8 flex flex-wrap gap-3">
            <a href={demoHref} className={BTN_PRIMARY}>
              Book a free demo <ArrowRight className="size-4" />
            </a>
            <a href="#chart" className={BTN_GHOST}>
              See how it works
            </a>
          </div>
          <ul className="hm-hero-in text-muted mt-10 grid gap-2.5 text-sm sm:grid-cols-3 sm:gap-4">
            {["WhatsApp & email recalls, no SMS fees", "GST invoices and a daily cash book", "Android apps for staff and patients"].map(
              (line) => (
                <li key={line} className="flex gap-2">
                  <Check className="text-brand-text mt-0.5 size-4 shrink-0" />
                  {line}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="hm-hero-board relative lg:pl-6">
          <ChairBoard />
          {/* Things that happen without anyone lifting a finger */}
          <div className="hm-float bg-surface border-line shadow-card absolute -top-6 -left-2 hidden items-center gap-3 rounded-xl border px-3.5 py-2.5 sm:flex lg:-left-10">
            <span className="bg-mint text-brand-text flex size-8 items-center justify-center rounded-lg">
              <MessageCircle className="size-4" />
            </span>
            <span className="text-xs">
              <span className="block font-medium">6-month recalls sent</span>
              <span className="text-muted flex items-center gap-1">
                WhatsApp · 14 patients <CheckCheck className="text-sky size-3.5" />
              </span>
            </span>
          </div>
          <div className="hm-float bg-surface border-line shadow-card absolute -right-2 -bottom-7 hidden items-center gap-3 rounded-xl border px-3.5 py-2.5 sm:flex lg:-right-6">
            <span className="bg-amber-wash flex size-8 items-center justify-center rounded-lg">
              <ReceiptIndianRupee className="size-4" />
            </span>
            <span className="text-xs">
              <span className="block font-medium">INV-2026-0142 paid</span>
              <span className="text-muted tabular-nums">₹2,500 · added to cash book</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
