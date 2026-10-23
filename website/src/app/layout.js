import "./globals.css";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/providers/theme-provider";
import { BRAND, SITE_URL } from "@/lib/site";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// The display voice: headlines, big figures, the italic accents.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
});

const DESCRIPTION =
  "Dental practice management software for Indian clinics: patient records, chair scheduling, GST billing, cash book, inventory, lab work, WhatsApp recalls and a leads CRM.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s | ${BRAND}`,
    default: `${BRAND}: dental practice management software`,
  },
  description: DESCRIPTION,
  openGraph: {
    siteName: BRAND,
    type: "website",
    description: DESCRIPTION,
    images: ["/logo.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
