# Dr. Dipti — Dental Practice API

Fastify + Sequelize + PostgreSQL API behind the clinic dashboard (`../client/dashboard`) and the patient-facing site.

## Setup

```bash
cp .env.example .env   # fill in DB credentials and secrets
npm install
npm run dev            # http://localhost:3001
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start |
| `npm test` | Run the test suite against `TEST_PG_DATABASE` (dropped and recreated each run) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

Revamp docs live in [`docs/revamp`](docs/revamp).
