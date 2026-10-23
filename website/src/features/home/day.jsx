import { Armchair, Bell, FlaskConical, ReceiptIndianRupee, Stethoscope, Wallet } from "lucide-react";
import { CONTAINER, Em, SectionHead } from "./ui";

const MOMENTS = [
  {
    time: "08:45",
    part: "Morning",
    icon: Armchair,
    title: "Open the chair board",
    text: "Every chair, every appointment and every doctor for the day. Check patients in as they arrive and see who has waited longest.",
  },
  {
    time: "10:30",
    part: "Chairside",
    icon: Stethoscope,
    title: "Examine, plan, treat",
    text: "Record the examination, chart the teeth, build the treatment plan, log the visit and print the prescription.",
  },
  {
    time: "13:00",
    part: "Front desk",
    icon: ReceiptIndianRupee,
    title: "Bill and collect",
    text: "Issue the GST invoice from the plan, take cash or adjust the advance, and the cash book updates itself.",
  },
  {
    time: "17:30",
    part: "Back room",
    icon: FlaskConical,
    title: "Lab cases and stock",
    text: "See which crowns are due back tomorrow, mark cases received or fitted, and log materials used before they run short.",
  },
  {
    time: "20:00",
    part: "Closing",
    icon: Wallet,
    title: "Close the day",
    text: "Reconcile the cash book, record expenses and the bank deposit, and check tomorrow's list.",
  },
  {
    time: "07:00",
    part: "Next morning",
    icon: Bell,
    title: "Bring patients back",
    text: "Recall and birthday messages go out by themselves, every day. New enquiries from ads land in the pipeline with a reminder to call.",
  },
];

// On large screens the section pins and the day slides past sideways as you
// scroll (see home.jsx); on small screens the moments simply stack.
export function Day() {
  return (
    <section id="day" className="hm-day border-line border-t">
      <div className="hm-day-pin flex flex-col justify-center overflow-hidden py-20 sm:py-28 lg:h-svh lg:py-0">
        <div className={CONTAINER}>
          <SectionHead
            num="03"
            label="A day at the clinic"
            title={
              <>
                From the first <Em>patient</Em> to the last cash count.
              </>
            }
          />
        </div>

        <div className="relative mt-12 lg:mt-16">
          {/* The timeline rule, filling as the day goes by */}
          <div className="bg-line absolute top-[0.45rem] right-0 left-0 hidden h-px lg:block" aria-hidden="true">
            <div className="hm-day-progress bg-brand h-full origin-left" />
          </div>
          <ol className="hm-day-track flex flex-col gap-4 px-5 sm:px-8 lg:w-max lg:flex-row lg:gap-6 lg:pr-[20vw] lg:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]">
            {MOMENTS.map((moment, i) => (
              <li key={moment.time} className="relative lg:w-[22rem] lg:pt-8">
                <span className="bg-bg border-brand absolute top-0 left-0 hidden size-[0.95rem] rounded-full border-2 lg:block" aria-hidden="true" />
                <div className="bg-surface border-line shadow-card h-full rounded-3xl border p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <p className="label text-muted">
                      {String(i + 1).padStart(2, "0")} · {moment.part}
                    </p>
                    <moment.icon className="text-brand-text size-5" />
                  </div>
                  <p className="font-display mt-6 text-5xl tabular-nums">{moment.time}</p>
                  <h3 className="mt-4 text-lg font-semibold">{moment.title}</h3>
                  <p className="text-muted mt-2 text-sm leading-relaxed">{moment.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
