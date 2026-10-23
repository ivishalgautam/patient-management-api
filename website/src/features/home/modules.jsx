import {
  CalendarCheck,
  FlaskConical,
  Megaphone,
  MessageCircle,
  ReceiptIndianRupee,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { CONTAINER, Em, SectionHead } from "./ui";

const CARD = "hm-card bg-surface border-line shadow-card flex flex-col overflow-hidden rounded-3xl border";

function CardText({ icon: Icon, title, children }) {
  return (
    <div className="p-6 sm:p-7">
      <span className="bg-mint text-brand-text flex size-9 items-center justify-center rounded-xl">
        <Icon className="size-[18px]" />
      </span>
      <h3 className="font-display mt-5 text-2xl leading-tight">{title}</h3>
      <p className="text-muted mt-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

// The small slice of real UI at the bottom of each card.
function Preview({ children, className = "" }) {
  return (
    <div className={`bg-sunken border-line mt-auto border-t px-6 py-5 sm:px-7 ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

const SLOTS = [
  ["Mon", [1, 0, 1, 1]],
  ["Tue", [1, 1, 1, 0]],
  ["Wed", [0, 2, 1, 1]],
  ["Thu", [1, 1, 0, 1]],
  ["Fri", [1, 1, 1, 1]],
  ["Sat", [2, 2, 0, 0]],
];

export function Modules() {
  return (
    <section id="features" className="bg-sunken/60 border-line border-t py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHead
          num="02"
          label="The whole practice"
          title={
            <>
              Everything behind the front desk, in <Em>one</Em> system.
            </>
          }
        >
          The schedule, the money, the stockroom and the marketing share one patient file. Give each person only the
          screens their role needs.
        </SectionHead>

        <div className="mt-14 grid gap-5 lg:grid-cols-6">
          {/* Appointments */}
          <article className={`${CARD} lg:col-span-3`}>
            <CardText icon={CalendarCheck} title="Appointments that never double-book">
              Doctor slots, leave and holidays, and slot rules that stop two patients landing in one chair. Reminders go
              out over WhatsApp.
            </CardText>
            <Preview>
              <div className="grid grid-cols-6 gap-2">
                {SLOTS.map(([day, slots]) => (
                  <div key={day}>
                    <p className="label text-muted text-center">{day}</p>
                    <div className="mt-2 space-y-1.5">
                      {slots.map((s, i) => (
                        <span
                          key={i}
                          className={`block h-4 rounded-md ${s === 1 ? "bg-mint-strong" : s === 2 ? "bg-amber" : "border-line-strong border border-dashed"}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Preview>
          </article>

          {/* Recalls */}
          <article className={`${CARD} lg:col-span-3`}>
            <CardText icon={MessageCircle} title="Recalls that bring patients back">
              Check-up reminders at 3, 6 and 12 months, birthday wishes and bulk messages, sent every day over WhatsApp
              and email. No SMS charges.
            </CardText>
            <Preview className="flex flex-col gap-2">
              <div className="bg-surface border-line max-w-[85%] rounded-2xl rounded-tl-sm border px-3.5 py-2.5 text-sm">
                Hi Riya, it&apos;s been 6 months since your cleaning at Smile Dental. Reply 1 to book a check-up.
                <span className="label text-muted mt-1 block text-right">10:00</span>
              </div>
              <div className="bg-mint ml-auto rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm">1</div>
            </Preview>
          </article>

          {/* GST invoices */}
          <article className={`${CARD} lg:col-span-2`}>
            <CardText icon={ReceiptIndianRupee} title="GST invoices">
              Numbered automatically, with line items, discount and GST, printed on A4 and linked to the treatment.
            </CardText>
            <Preview>
              <p className="label text-muted">INV-2026-0142</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                {[
                  ["Scaling & polishing", "1,800"],
                  ["X-ray (IOPA)", "300"],
                  ["GST 18%", "378"],
                ].map(([item, amount]) => (
                  <div key={item} className="flex justify-between gap-3">
                    <dt className="text-muted">{item}</dt>
                    <dd className="tabular-nums">₹{amount}</dd>
                  </div>
                ))}
                <div className="border-line-strong flex justify-between border-t pt-1.5 font-medium">
                  <dt>Total</dt>
                  <dd className="tabular-nums">₹2,478</dd>
                </div>
              </dl>
            </Preview>
          </article>

          {/* Cash book */}
          <article className={`${CARD} lg:col-span-2`}>
            <CardText icon={Wallet} title="A cash book that fills itself">
              Patient payments and cash expenses land in each clinic&apos;s cash book. Income vs expenditure for any dates.
            </CardText>
            <Preview>
              <dl className="space-y-1.5 text-sm">
                {[
                  ["Opening", "4,200", ""],
                  ["Patient payments", "+18,650", "text-brand-text"],
                  ["Lab charges", "−2,400", "text-coral"],
                  ["Bank deposit", "−15,000", "text-muted"],
                ].map(([item, amount, tone]) => (
                  <div key={item} className="flex justify-between gap-3">
                    <dt className="text-muted">{item}</dt>
                    <dd className={`tabular-nums ${tone}`}>₹{amount}</dd>
                  </div>
                ))}
                <div className="border-line-strong flex justify-between border-t pt-1.5 font-medium">
                  <dt>In the drawer</dt>
                  <dd className="tabular-nums">₹5,450</dd>
                </div>
              </dl>
            </Preview>
          </article>

          {/* Inventory & lab */}
          <article className={`${CARD} lg:col-span-2`}>
            <CardText icon={FlaskConical} title="Stock and lab cases">
              Low stock flagged before the last box runs out. Lab work tracked from sent to fitted, with due dates.
            </CardText>
            <Preview className="space-y-3 text-sm">
              {[
                ["Composite A2", 18, true],
                ["Gloves (M)", 72, false],
              ].map(([item, level, low]) => (
                <div key={item}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {item}
                      {low && <TriangleAlert className="text-coral size-3.5" />}
                    </span>
                    <span className="text-muted text-xs tabular-nums">{level}%</span>
                  </div>
                  <span className="bg-line mt-1.5 block h-1.5 overflow-hidden rounded-full">
                    <span className={`block h-full rounded-full ${low ? "bg-coral" : "bg-brand"}`} style={{ width: `${level}%` }} />
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span>Crown · 26 · Sai Lab</span>
                <span className="bg-amber-wash rounded-full px-2 py-0.5 text-xs">Due Thu</span>
              </div>
            </Preview>
          </article>

          {/* Leads CRM, full width */}
          <article className={`${CARD} lg:col-span-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`}>
            <CardText icon={Megaphone} title="A leads CRM, so ad enquiries turn into patients">
              Facebook and Instagram lead ads, Google leads, hosted forms and webhooks land in pipelines with the stages
              you define. Follow-up reminders keep leads from going cold, and a lead becomes a patient in one step.
            </CardText>
            <div className="bg-sunken border-line grid grid-cols-2 gap-3 border-t p-6 sm:grid-cols-4 sm:p-7 lg:border-t-0 lg:border-l" aria-hidden="true">
              {[
                ["New enquiry", "bg-sky", [["Ananya", "Braces · Instagram"], ["Fatima", "Whitening · Website"]]],
                ["Called", "bg-amber", [["Rohit", "Implant · Google"]]],
                ["Visit booked", "bg-mint-strong", [["Karan", "Root canal · Facebook"], ["Dev", "Aligners · Instagram"]]],
                ["Patient", "bg-brand", [["Lakshmi", "Dentures · Walk-in"]]],
              ].map(([stage, dot, leads]) => (
                <div key={stage}>
                  <p className="text-muted flex items-center gap-1.5 text-xs font-medium">
                    <span className={`${dot} size-2 rounded-full`} />
                    {stage}
                    <span className="ml-auto tabular-nums">{leads.length}</span>
                  </p>
                  <div className="mt-2.5 space-y-2">
                    {leads.map(([name, meta]) => (
                      <div key={name} className="bg-surface border-line rounded-xl border px-3 py-2">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-muted truncate text-[11px]">{meta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
