import { Building2, Download, FileSpreadsheet, KeyRound, Mail, Megaphone, MessageCircle, Search, ShieldCheck, Users, Webhook } from "lucide-react";
import { CONTAINER } from "./ui";

const SAFETY = [
  { icon: Building2, title: "Each practice kept apart", text: "Staff reach only their own practice and the clinics they're assigned to." },
  { icon: Users, title: "Roles checked on the server", text: "Admin, doctor and staff roles, plus your own. Every action is checked, not just hidden." },
  { icon: KeyRound, title: "Sessions you control", text: "Change a password or deactivate a user and they're signed out everywhere, at once." },
  { icon: Download, title: "Your data is yours", text: "Export patients, leads and reports at any time. Database and files are backed up." },
];

const INTEGRATIONS = [
  { icon: MessageCircle, title: "WhatsApp Cloud API", text: "Reminders and recalls" },
  { icon: Megaphone, title: "Facebook & Instagram", text: "Lead ads, instantly" },
  { icon: Search, title: "Google leads", text: "From your Google ads" },
  { icon: Mail, title: "Your own email", text: "Gmail, Zoho, Outlook…" },
  { icon: Webhook, title: "Webhooks", text: "Leads from anywhere" },
  { icon: FileSpreadsheet, title: "CSV & Excel", text: "Import and export" },
];

// The inverted band: security first, then what DentXCloud connects to.
export function Trust() {
  return (
    <section className="bg-night text-night-ink py-20 sm:py-28">
      <div className={CONTAINER}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="hm-head">
            <p className="hm-rise label flex items-center gap-3 opacity-70">
              <span>05</span>
              <span className="bg-night-line h-px w-8" />
              Security
            </p>
            <h2 className="hm-rise font-display mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-[3.5rem]">
              Patient files deserve a <em className="italic opacity-70">lock</em>.
            </h2>
            <ShieldCheck className="hm-rise mt-10 hidden size-28 stroke-[0.8] opacity-25 lg:block" aria-hidden="true" />
          </div>
          <div className="border-night-line grid border-t sm:grid-cols-2">
            {SAFETY.map((item, i) => (
              <div
                key={item.title}
                className={`hm-reveal border-night-line border-b py-7 ${i % 2 === 0 ? "sm:border-r sm:pr-8" : "sm:pl-8"}`}
              >
                <item.icon className="size-5 opacity-80" />
                <h3 className="mt-4 text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-70">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 sm:mt-28">
          <p className="label flex items-center gap-3 opacity-70">
            <span>06</span>
            <span className="bg-night-line h-px w-8" />
            Plugs into what you already use
          </p>
          <ul className="border-night-line mt-8 grid grid-cols-2 border-t border-l sm:grid-cols-3 lg:grid-cols-6">
            {INTEGRATIONS.map((item) => (
              <li key={item.title} className="hm-reveal border-night-line border-r border-b p-5">
                <item.icon className="size-5 opacity-80" />
                <p className="mt-6 text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs opacity-60">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
