// Everything the site says about the business lives here, read from env so
// the same build can be pointed at a different dashboard or contact. Set
// them in .env.local (see .env.example) before publishing the privacy policy.
const env = (value, fallback) => (value && value.trim()) || fallback;

export const BRAND = "DentXCloud";

// The clinic dashboard: sign in lives there.
const APP_URL = env(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000").replace(/\/$/, "");
export const appUrl = (path = "/") => `${APP_URL}${path}`;

// Where this marketing site is served, for canonical URLs and the sitemap.
export const SITE_URL = env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3005").replace(/\/$/, "");

export const COMPANY = env(process.env.NEXT_PUBLIC_COMPANY_NAME, BRAND);
export const CONTACT_EMAIL = env(process.env.NEXT_PUBLIC_CONTACT_EMAIL, "[contact email]");
export const CONTACT_PHONE = env(process.env.NEXT_PUBLIC_CONTACT_PHONE, "");
export const CONTACT_ADDRESS = env(process.env.NEXT_PUBLIC_CONTACT_ADDRESS, "");

export const mailto = (subject) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

// "Book a demo" opens WhatsApp when a phone number is set, email otherwise.
export const demoHref = (() => {
  const digits = CONTACT_PHONE.replace(/\D/g, "");
  if (digits) {
    const text = `Hi ${BRAND}, I'd like a demo for my dental clinic.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
  return mailto(`${BRAND} demo request`);
})();

// The two Android apps on Google Play.
export const APPS = [
  { name: "DentXCloud", pkg: "com.dentxcloud.practice", who: "doctors and clinic staff" },
  { name: "DentXCloud Patient", pkg: "com.dentxcloud.patient", who: "patients of clinics that use DentXCloud" },
];
