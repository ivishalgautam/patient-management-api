# DentXCloud website

Marketing site for DentXCloud, plus the privacy policy and account deletion pages that Google Play asks for.
Next.js 16 (app router, plain JS), Tailwind CSS 4, GSAP. Calm editorial design: Fraunces serif headlines, Geist body, product mock-ups drawn in code.

```bash
npm install
npm run dev      # http://localhost:3005
npm run build && npm start
```

- `/` home page: `src/features/home/home.jsx` (all GSAP motion) composes `hero.jsx` (live chair board), `tooth-chart.jsx` (interactive FDI chart), `modules.jsx`, `day.jsx` (pinned sideways timeline on desktop), `apps.jsx`, `trust.jsx`, `faq.jsx`, `site-footer.jsx`.
- `/privacy` privacy policy and `/delete-account` account deletion: `src/app/*/page.jsx`, framed by `src/features/legal/legal-page.jsx`.
- Contact details, company name and the dashboard URL come from env (`.env.example`, read in `src/lib/site.js`).
  Set `NEXT_PUBLIC_CONTACT_EMAIL` before publishing: the privacy policy shows it.
- Colours are tokens in `src/app/globals.css`, each with a light and a dark value. All animation runs inside
  `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`.

## Google Play Console

- Privacy policy URL: `https://<your-domain>/privacy`
- Delete account URL (Data safety → Data deletion): `https://<your-domain>/delete-account`
