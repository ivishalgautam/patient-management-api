import { CalendarPlus, Check, FileText, Monitor, Phone, Smartphone, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { CONTAINER, Em, SectionHead } from "./ui";

// A phone frame around a miniature screen.
function PhoneFrame({ className = "", children, label }) {
  return (
    <div className={`hm-phone bg-night w-[15.5rem] rounded-[2.4rem] p-2 shadow-[var(--shadow-float)] ${className}`} aria-label={label} role="img">
      <div className="bg-bg relative overflow-hidden rounded-[1.9rem]" aria-hidden="true">
        <div className="bg-line-strong mx-auto mt-2 h-1.5 w-14 rounded-full" />
        {children}
      </div>
    </div>
  );
}

function StaffScreen() {
  return (
    <div className="px-4 pt-4 pb-5">
      <div className="flex items-center gap-2">
        <span className="bg-brand text-brand-ink flex size-7 items-center justify-center rounded-lg">
          <BrandMark className="w-4" />
        </span>
        <span className="text-xs font-semibold">DentXCloud</span>
      </div>
      <p className="font-display mt-4 text-xl leading-tight">Hello, Doctor</p>
      <p className="text-muted text-[11px]">8 appointments today</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ["In chair", "2", "bg-mint"],
          ["Waiting", "3", "bg-amber-wash"],
          ["Collected", "₹12.4k", "bg-sky-wash"],
          ["Lab due", "2", "bg-coral-wash"],
        ].map(([label, value, fill]) => (
          <div key={label} className={`${fill} rounded-xl px-2.5 py-2`}>
            <p className="text-muted text-[10px]">{label}</p>
            <p className="text-base font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {[
          ["10:30", "Riya · Scaling"],
          ["11:15", "Arjun · Root canal"],
          ["12:00", "Meera · Braces"],
        ].map(([time, who]) => (
          <div key={time} className="bg-surface border-line flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px]">
            <span className="text-muted tabular-nums">{time}</span>
            <span className="flex-1 truncate font-medium">{who}</span>
            <Phone className="text-muted size-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientScreen() {
  return (
    <div className="px-4 pt-4 pb-5">
      <p className="label text-muted">Next visit</p>
      <div className="bg-brand text-brand-ink mt-2 rounded-2xl p-3.5">
        <p className="font-display text-2xl leading-none">Thu, 30 Oct</p>
        <p className="mt-1 text-xs opacity-90">11:00 · Dr. Mehta · Chair 2</p>
        <p className="mt-2 text-xs opacity-90">Extraction · 48</p>
      </div>
      <p className="label text-muted mt-4">My records</p>
      <div className="mt-2 space-y-1.5">
        {[
          [FileText, "Prescription · 12 Aug"],
          [FileText, "OPG X-ray · 2 Aug"],
          [Check, "Root canal · 16 · done"],
        ].map(([Icon, item]) => (
          <div key={item} className="bg-surface border-line flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px]">
            <Icon className="text-brand-text size-3.5" />
            <span className="truncate">{item}</span>
          </div>
        ))}
      </div>
      <div className="border-line-strong mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-[11px] font-medium">
        <CalendarPlus className="size-3.5" /> Book a visit
      </div>
    </div>
  );
}

const WAYS = [
  { icon: Monitor, title: "Clinic dashboard", text: "In the browser, for doctors, the front desk and the owner. Nothing to install." },
  { icon: Smartphone, title: "DentXCloud for staff", text: "The chair board, today's appointments and patient files on Android." },
  { icon: UserRound, title: "DentXCloud Patient", text: "Patients book visits and see their own records, prescriptions and documents." },
];

export function Apps() {
  return (
    <section id="apps" className="border-line border-t py-20 sm:py-28">
      <div className={`${CONTAINER} grid items-center gap-16 lg:grid-cols-2`}>
        <div>
          <SectionHead
            num="04"
            label="Three ways in"
            title={
              <>
                At the desk, in your pocket, <Em>and in theirs</Em>.
              </>
            }
          >
            The same login and the same permissions everywhere. Staff only see the clinics they work at; patients only see
            themselves.
          </SectionHead>
          <ul className="border-line mt-10 divide-y divide-[var(--line)] border-y">
            {WAYS.map((way) => (
              <li key={way.title} className="hm-reveal flex gap-4 py-5">
                <way.icon className="text-brand-text mt-0.5 size-5 shrink-0" />
                <div>
                  <h3 className="font-medium">{way.title}</h3>
                  <p className="text-muted mt-1 text-sm">{way.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto flex h-[34rem] w-full max-w-md items-center justify-center">
          <div
            className="bg-mint absolute inset-x-6 top-10 bottom-10 -z-10 rounded-[3rem]"
            aria-hidden="true"
          />
          <PhoneFrame className="absolute top-2 left-0 -rotate-6 sm:left-4" label="The DentXCloud staff app">
            <StaffScreen />
          </PhoneFrame>
          <PhoneFrame className="absolute right-0 bottom-2 rotate-6 sm:right-4" label="The DentXCloud Patient app">
            <PatientScreen />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}
