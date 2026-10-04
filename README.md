# Majaagya

Majaagya is a personal dashboard to manage every area of life in one place.
Built for personal use first; may become a public product later.

**Live app:** https://parmjeet1.github.io/Personal-life-manager/
Open it on your phone in Chrome → menu ⋮ → **Install app**. It then works offline like a normal app.

## Status

v0.1 — all 9 modules, home dashboard, search, weekly review, backup/restore.

## Principles

- Works offline (installable PWA, no server).
- Data stays on your device (IndexedDB); export and import as JSON.
- Built in free time, one improvement at a time.
- Personal use first; go public only after 2–3 months of daily use.

## Modules

| # | Module | What it tracks | Built-in rules |
| --- | --- | --- | --- |
| 1 | Projects | Stage, phases, deadline, next action, priority | Max 3 Ongoing, 7-day idea cooling, next action required, stale after 14 days |
| 2 | Bhakti | Sadhana log, notes, verses, Ekadashi/festival calendar | Japa streak, 7-day rounds chart |
| 3 | Finance | Loans taken and given, payments, EMI | Overdue auto, avalanche vs snowball, debt-free date |
| 4 | Learn | Topics, resources, hours, proof | Max 2 Learning, Done needs proof |
| 5 | Try | Ideas, effort, cost, rating | Pick-for-me, 1 per month |
| 6 | Journal | Entries, mood, energy, gratitude | Daily prompt, on-this-day, 30-day trend, PIN lock |
| 7 | Affirmations | Text, life area, linked goal | 3–5 active, read counter on home |
| 8 | Relationships | People, circle, rhythm, birthdays, log | Due dates by circle, monthly planner, call/WhatsApp |
| 9 | Links | Links, Sheets, Docs, tools, accounts | Never store passwords, 90-day cleanup, pinned on home |

## Data rules

- Every record has a UUID plus `createdAt`, `updatedAt`, `deletedAt`.
- Delete = archive (restore from Settings → Archive).
- Backups carry `schemaVersion`; import merges, newer record wins.
- Never commit personal data or exported backups to this repo (`.gitignore` blocks them).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/Personal-life-manager/
npm run build    # output in dist/
```

Every push to `main` builds and publishes to the `gh-pages` branch via GitHub Actions.

## Code map

| Path | What it does |
| --- | --- |
| `src/db.js` | The only file that touches storage (Dexie/IndexedDB), export/import |
| `src/modules/config.js` | All modules: fields, filters, card chips, actions, validation rules |
| `src/modules/logic.js` | Pure business rules (loan maths, due dates, streaks) |
| `src/components/` | Generic form, fields, record card, PIN gate |
| `src/views/` | Home, module list, summaries, search, review, settings, archive |

Adding a field = one line in `config.js`. Adding a module = one entry in `COLLECTION_DEFS` + `MODULES` + `COLLECTIONS` in `db.js`.
