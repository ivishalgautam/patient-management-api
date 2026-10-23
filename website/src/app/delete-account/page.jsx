import Link from "next/link";
import { APPS, BRAND, CONTACT_EMAIL, mailto } from "@/lib/site";
import { LegalPage } from "@/features/legal/legal-page";

export const metadata = {
  title: "Delete your account",
  description: `How to delete your ${BRAND} account and data, and what is removed.`,
  alternates: { canonical: "/delete-account" },
};

const SUBJECT = `${BRAND}: delete my account`;

export default function DeleteAccountPage() {
  return (
    <LegalPage eyebrow="sad to see you go" title="Delete your account" updated="23 October 2026">
      <p>
        This page explains how to delete an account you use in the {BRAND} apps ({APPS.map((app) => app.name).join(" and ")})
        or the {BRAND} dashboard, and what happens to your data.
      </p>

      <h2 id="how">How to ask</h2>
      <ol>
        <li>
          Email <a href={mailto(SUBJECT)}>{CONTACT_EMAIL}</a> from the email address or mobile number on your account,
          with the subject &ldquo;{SUBJECT}&rdquo;.
        </li>
        <li>Include your username (patients: the username shown when you registered, e.g. ddss123) and the clinic you use.</li>
        <li>We may contact you to confirm it&apos;s really you before deleting anything.</li>
      </ol>
      <p>We confirm by email once it&apos;s done, within 30 days of your request.</p>

      <h2 id="removed">What is deleted</h2>
      <ul>
        <li>Your sign-in account: username, password, and contact details on the account.</li>
        <li>Your sign-in sessions on every device and your in-app notifications.</li>
        <li>For patients: your profile details and documents you uploaded yourself.</li>
      </ul>

      <h2 id="kept">What may be kept</h2>
      <ul>
        <li>
          <strong>Treatment and billing records.</strong> Your dental clinic is responsible for your clinical records and
          invoices and may have to keep them for a number of years under medical and tax rules. We ask the clinic before
          removing them and tell you what the clinic keeps and why.
        </li>
        <li>
          <strong>Backups.</strong> Deleted data disappears from our rolling backups within 90 days.
        </li>
      </ul>

      <h2 id="staff">Clinic owners and staff</h2>
      <p>
        A clinic administrator can deactivate a staff user in the dashboard at any time, which signs them out
        everywhere. To close a whole practice and delete its data, the owner can email us as above.
      </p>

      <p>
        See our <Link href="/privacy">privacy policy</Link> for more on how we handle your data.
      </p>
    </LegalPage>
  );
}
