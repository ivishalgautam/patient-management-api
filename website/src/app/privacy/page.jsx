import Link from "next/link";
import { APPS, BRAND, COMPANY, CONTACT_ADDRESS, CONTACT_EMAIL, mailto } from "@/lib/site";
import { LegalPage } from "@/features/legal/legal-page";

export const metadata = {
  title: "Privacy policy",
  description: `How ${BRAND} collects, uses, shares and protects information in its website, clinic dashboard and Android apps.`,
  alternates: { canonical: "/privacy" },
};

const UPDATED = "23 October 2026";

const TOC = [
  ["scope", "Who we are"],
  ["collect", "What we collect"],
  ["not-collect", "What we don't collect"],
  ["use", "How we use it"],
  ["share", "Who we share it with"],
  ["permissions", "App permissions"],
  ["security", "How we protect it"],
  ["retention", "How long we keep it"],
  ["rights", "Your rights"],
  ["deletion", "Deleting your account"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact us"],
];

function H2({ id, children }) {
  return <h2 id={id}>{children}</h2>;
}

export default function PrivacyPage() {
  const email = (
    <a href={mailto(`Privacy question: ${BRAND}`)}>{CONTACT_EMAIL}</a>
  );

  return (
    <LegalPage eyebrow="the fine print, in plain words" title="Privacy policy" updated={UPDATED} toc={TOC}>
      <p>
        This policy explains what information {BRAND} collects, why, who it is shared with and the choices you
        have. It applies to the {BRAND} website, the {BRAND} clinic dashboard and our Android apps:
      </p>
      <ul>
        {APPS.map((app) => (
          <li key={app.pkg}>
            <strong>{app.name}</strong> ({app.pkg}), for {app.who}.
          </li>
        ))}
      </ul>

      <H2 id="scope">1. Who we are</H2>
      <p>
        {BRAND} is dental practice management software operated by {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        Dental clinics use it to keep patient records, schedule appointments, bill, manage accounts, track inventory
        and lab work, send reminders and follow up on enquiries.
      </p>
      <p>
        When a clinic records information about its patients in {BRAND}, the clinic decides what is recorded and why;
        under India&apos;s Digital Personal Data Protection Act, 2023 the clinic is the <em>data fiduciary</em> for
        those patient records and we process them on the clinic&apos;s behalf. For the accounts we run ourselves
        (clinic owners and staff signing up, and visitors to this website) we are responsible for the data.
      </p>

      <H2 id="collect">2. What we collect</H2>
      <h3>Account information</h3>
      <ul>
        <li>
          Clinic users (doctors, staff, administrators): name, username, password, role, email address, mobile number
          and the clinics they work at.
        </li>
        <li>
          Patients who register in the {BRAND} Patient app: full name, mobile number, email address, gender and date
          of birth. Passwords are stored only as a one-way hash.
        </li>
      </ul>
      <h3>Health and treatment information</h3>
      <p>
        Entered by the clinic, and in some cases by the patient: medical history, allergies, examinations, tooth
        charts and notes, treatment plans, visits, prescriptions, vitals, X-rays, reports, consent forms and other
        documents. This is sensitive information and we treat it that way.
      </p>
      <h3>Appointments, billing and payments</h3>
      <p>
        Appointment bookings and check-ins, invoices, payments and advances recorded by the clinic, expenses, cash
        book entries, inventory and lab cases. {BRAND} does not process card or bank payments and never sees card
        numbers; clinics record payments they have received.
      </p>
      <h3>Photos and files you upload</h3>
      <p>
        When you choose to take a photo or pick a file (for example an X-ray, a report or a document), that image or
        file is uploaded to the patient&apos;s record. Nothing is captured or uploaded unless you tap to do so.
      </p>
      <h3>Enquiries and messages handled for clinics</h3>
      <p>
        If a clinic connects them: enquiry (lead) details received from its website forms, Facebook and Instagram
        lead ads, Google lead forms or webhooks; emails in the clinic&apos;s connected mailbox; and a record of the
        WhatsApp and email reminders and messages sent to patients.
      </p>
      <h3>Technical information</h3>
      <p>
        Our servers record standard request information (such as IP address, date and time, the page or API
        called, and app version) to keep the service secure and working. The apps store your sign-in session on your
        device in the operating system&apos;s encrypted storage, so you stay signed in. Passwords, tokens and request
        contents are not written to our logs.
      </p>
      <h3>When you contact us</h3>
      <p>If you email us or ask for a demo, we keep what you send us (such as your name, clinic, phone and email) to reply.</p>

      <H2 id="not-collect">3. What we don&apos;t collect</H2>
      <ul>
        <li>We don&apos;t collect your location, contacts, call logs or SMS.</li>
        <li>We don&apos;t use the advertising ID and the apps contain no advertising or third-party analytics SDKs.</li>
        <li>We don&apos;t sell personal information or use patient data for advertising.</li>
      </ul>

      <H2 id="use">4. How we use information</H2>
      <ul>
        <li>To provide {BRAND}: show records, appointments, invoices and reports to the right people at the clinic.</li>
        <li>To let patients book appointments and see their own records and documents in the Patient app.</li>
        <li>
          To send appointment reminders, recalls, birthday wishes and other messages that a clinic has switched on,
          over WhatsApp or email.
        </li>
        <li>To show in-app notifications, for example when an appointment is booked, rescheduled or checked in.</li>
        <li>To keep accounts secure, prevent misuse, fix problems and back up data.</li>
        <li>To answer your questions and provide support.</li>
        <li>To meet legal obligations, such as keeping invoice and tax records.</li>
      </ul>

      <H2 id="share">5. Who we share it with</H2>
      <ul>
        <li>
          <strong>Your clinic.</strong> Information is visible to the clinic&apos;s users according to the roles and
          permissions the clinic sets. Staff only see the clinics they are assigned to, and one practice can never see
          another practice&apos;s records.
        </li>
        <li>
          <strong>Service providers</strong> that run parts of the service for us, under contract and only for that
          purpose: cloud hosting and backups, and email delivery.
        </li>
        <li>
          <strong>Services a clinic chooses to connect</strong>: Meta (WhatsApp Cloud API, Facebook and Instagram lead
          ads), Google (lead forms) and the clinic&apos;s own email provider. Messages to patients are delivered
          through these services and are also subject to their privacy policies.
        </li>
        <li>
          <strong>Legal reasons</strong>: when required by law, court order or a government authority, or to protect
          the rights and safety of patients, clinics, users or us.
        </li>
        <li>
          <strong>Business transfers</strong>: if {COMPANY} is merged or acquired, information may transfer to the new
          owner under this same policy.
        </li>
      </ul>

      <H2 id="permissions">6. App permissions</H2>
      <ul>
        <li>
          <strong>Camera</strong> (optional): only to take a photo of an X-ray, report or document when you tap
          &ldquo;take photo&rdquo;. You can refuse it and still use the app.
        </li>
        <li>
          <strong>Photos and files</strong>: the system picker opens only when you choose to attach something; the app
          gets just the items you pick.
        </li>
        <li>
          <strong>Internet</strong>: to talk to the {BRAND} servers.
        </li>
      </ul>
      <p>You can change permissions at any time in your phone&apos;s settings.</p>

      <H2 id="security">7. How we protect information</H2>
      <ul>
        <li>All traffic between the apps, the dashboard and our servers is encrypted with HTTPS.</li>
        <li>Passwords are hashed; credentials for connected services (Facebook, email accounts) are stored encrypted.</li>
        <li>
          Every request is checked against the user&apos;s role and permissions on the server, and each practice&apos;s
          data is kept separate.
        </li>
        <li>Changing a password or deactivating a user signs them out on every device.</li>
        <li>The database and uploaded files are backed up regularly.</li>
      </ul>
      <p>No system is perfectly secure, but we work to protect your information and will notify affected clinics and users of a breach as the law requires.</p>

      <H2 id="retention">8. How long we keep it</H2>
      <p>
        We keep information for as long as the clinic&apos;s account is active, or as long as needed to provide the
        service. Clinics often have to keep patient and treatment records, and invoices, for years under medical and
        tax rules, so a clinic may keep its records after a patient stops visiting. When a clinic closes its account, we
        delete or anonymise its data within 90 days, except where we must keep it longer by law. Backups are overwritten
        on a rolling basis.
      </p>

      <H2 id="rights">9. Your rights</H2>
      <p>Subject to applicable law, including the Digital Personal Data Protection Act, 2023, you can:</p>
      <ul>
        <li>ask for a summary of the personal data held about you and how it is used;</li>
        <li>ask for inaccurate or incomplete data to be corrected or updated;</li>
        <li>ask for your data to be erased when it is no longer needed, or withdraw consent you gave;</li>
        <li>nominate someone to exercise these rights on your behalf; and</li>
        <li>raise a grievance with us, and then with the Data Protection Board of India.</li>
      </ul>
      <p>
        If you are a patient, your clinic controls your treatment records, so please contact the clinic first. You can
        also write to us at {email} and we will pass your request to the clinic and help them respond. We reply to
        requests within 30 days.
      </p>

      <H2 id="deletion">10. Deleting your account</H2>
      <p>
        You can ask us to delete your {BRAND} account and associated data at any time. See{" "}
        <Link href="/delete-account">how to delete your account</Link> for the steps and what is removed.
      </p>

      <H2 id="children">11. Children</H2>
      <p>
        {BRAND} is used by clinics to treat patients of every age, so a clinic may keep records about a child. These
        are created by the clinic with the consent of a parent or guardian. The Patient app is meant for adults; a
        parent or guardian should register and manage a child&apos;s appointments. We don&apos;t knowingly let children
        under 18 create their own account, and we don&apos;t track or target children.
      </p>

      <H2 id="changes">12. Changes to this policy</H2>
      <p>
        We may update this policy when the service changes. We will change the &ldquo;last updated&rdquo; date above
        and, for significant changes, tell clinics by email or in the dashboard before they take effect.
      </p>

      <H2 id="contact">13. Contact us</H2>
      <p>
        Questions, requests or complaints about privacy (including our grievance officer): {email}
        {CONTACT_ADDRESS && (
          <>
            <br />
            {COMPANY}, {CONTACT_ADDRESS}
          </>
        )}
      </p>
    </LegalPage>
  );
}
