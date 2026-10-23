"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { BRAND } from "@/lib/site";
import { CONTAINER, Em, SectionHead } from "./ui";

const FAQS = [
  {
    q: "Does it send SMS?",
    a: "No. Reminders and patient messages go over WhatsApp and email, which patients actually read and which don't carry per-message SMS charges.",
  },
  {
    q: "Can I manage more than one branch?",
    a: "Yes. Add any number of clinics under one practice. Doctors and staff are assigned per clinic, and reports can be viewed per clinic or combined.",
  },
  {
    q: "Who can see what?",
    a: "You decide, with roles. Built-in roles cover admin, doctor and staff, and you can create your own with exactly the permissions you want. Every action is checked on the server, not just hidden on the screen.",
  },
  {
    q: "Can I bring my existing patient data?",
    a: "Yes. Leads can be imported from a spreadsheet directly, with duplicate detection. Patient records are migrated with you during onboarding.",
  },
  {
    q: "Are the invoices GST-ready?",
    a: "Invoices are numbered sequentially per practice, carry line items, discount and GST, and print as a clean A4 sheet. Each one is linked to the treatment, so paid and balance always match the payments.",
  },
  {
    q: "Can patients book online?",
    a: `Patients get the ${BRAND} Patient app to book appointments and see their records and documents. Lead forms on your website also capture appointment requests into your pipeline.`,
  },
  {
    q: "Do I need to install anything?",
    a: `No. The dashboard runs in the browser. The ${BRAND} staff app and the patient app are on Android.`,
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="border-line border-t py-20 sm:py-28">
      <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16`}>
        <SectionHead
          num="07"
          label="FAQ"
          title={
            <>
              Before you say <Em>&ldquo;aah&rdquo;</Em>.
            </>
          }
        />
        <ul className="border-line border-t">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <li key={faq.q} className="border-line border-b">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className="font-display text-xl sm:text-2xl">{faq.q}</span>
                  <Plus className={`text-muted size-5 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <p className="text-muted max-w-2xl pb-6 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
