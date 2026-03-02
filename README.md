# Bjerke Service App

Mobil-first prosjektstyring for Bjerke Service.

## Bolge 1-6 status

Ferdig i denne leveransen:

- Grunnprosjekt med Next.js + TypeScript + Tailwind
- Rollebasert auth med Auth.js credentials
- Roller: `ADMIN` og `EMPLOYEE`
- Beskyttede sider via server-side guards
- Toppmeny + sidenavigasjon (desktop) + bunnnavigasjon (mobil)
- Kunder (Bolge 2):
  - CRUD (opprett, les, rediger, deaktiver via status)
  - Hurtigsok + filtrering
  - Kundedetaljer med mobil-lenker for ring og e-post
  - Prosjektoversikt per kunde
- Prosjekter (Bolge 3):
  - CRUD
  - Statusfilter i prosjektliste
  - Billingtype (`TIME` / `FASTPRIS`)
  - Prosjektdetaljer med sections
- Sjekklister (Bolge 4):
  - Maler (`ChecklistTemplate`) administrert av admin
  - Opprett prosjekt-sjekkliste fra mal eller scratch
  - Punkt-svar: `JA` / `NEI` / `IKKE_RELEVANT`
  - Kommentar per punkt
  - Bildevedlegg per punkt (flere bilder)
  - Autosave + debounce + local draft for refresh-sikkerhet
- Timer/okonomi (Bolge 5):
  - Timeregistrering per prosjekt: dato, ansatt, timer, beskrivelse, belop eks mva, fakturerbar
  - Belop kan auto-beregnes fra prosjekt-timepris og overstyres manuelt
  - Prosjektside viser timer per 14-dagersperiode med summering
  - Fastpris-forbruk vises mot fastprisbelop
  - Rapportside "Fakturer naa" viser aggregert per prosjekt/periode (timer + tillegg/utgifter)
- Tilbud/kalkulasjon (Bolge 6):
  - Tilbudstyper: `FASTPRIS` og `TIMEBASERT`
  - Kalkyle med timeestimat, materialkost, paslag %, risiko-buffer % og mva %
  - Statusflyt: `UTKAST -> SENDT -> GODKJENT -> AVVIST`
  - Godkjent tilbud konverteres automatisk til prosjekt
  - Endringshistorikk per tilbud (inkludert statusendringer og konvertering)
  - PDF-generering med logo, kundeinfo, spesifikasjon og totaler eks/inkl mva
- Prosjektokonomi (tillegg):
  - Registrer `UTGIFT` pa prosjekt (materialkjop, maskinleie osv.)
  - Registrer `TILLEGG` pa prosjekt (uforutsette tillegg i jobb)
  - Rediger/slett eksisterende okonomiposter direkte pa prosjektsiden
  - Lonnsomhet vises pa prosjektsiden med resultat eks mva (pluss/minus)
  - Stottes for bade `FASTPRIS` og `TIME`-prosjekter

## Tilgangsvalg

Prosjekt-, sjekkliste- og timer-tilgang er satt til default policy:

- Alle innloggede brukere (`ADMIN` og `EMPLOYEE`) kan se alle prosjekter og registrere timer.
- Alle innloggede brukere (`ADMIN` og `EMPLOYEE`) kan opprette og administrere tilbud.

Dette er valgt fordi prosjekt-eierskap ikke er modellert enna.

## Kostmodell for FASTPRIS (Bolge 5)

Default kostmodell na:

- `forbruk` for fastpris = sum registrert `belopEksMva` pa timeregistreringer.

Datamodellen er forberedt for senere internkost-modell:

- `TimeEntry.internKostPerTime` finnes som valgfritt felt for framtidig bruk.

## Teknologistack

- `Next.js` 15
- `TypeScript`
- `Auth.js (next-auth)` med `@auth/prisma-adapter`
- `PostgreSQL`
- `Prisma ORM`
- `Zod`

## Datamodell (Bolge 1-6)

Se [prisma/schema.prisma](./prisma/schema.prisma).

Kjernetabeller:

- `User` (inkludert `role`)
- `Account`, `Session`, `VerificationToken` (Auth.js)
- `AuditLog`
- `Customer`
- `Project`
- `TimeEntry`
- `ChecklistTemplate`
- `ChecklistTemplateItem`
- `ProjectChecklist`
- `ProjectChecklistItem`
- `ChecklistItemAttachment`
- `Offer`
- `OfferSpecificationItem`
- `OfferHistory`
- `ProjectFinanceEntry`

## API-endepunkter

Kunder:

- `GET /api/customers`
- `POST /api/customers`
- `GET /api/customers/:customerId`
- `PATCH /api/customers/:customerId`
- `DELETE /api/customers/:customerId`

Prosjekter:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

Sjekklister:

- `GET /api/checklist-templates`
- `POST /api/checklist-templates` (admin)
- `GET /api/checklist-templates/:templateId`
- `PATCH /api/checklist-templates/:templateId` (admin)
- `DELETE /api/checklist-templates/:templateId` (admin)
- `GET /api/projects/:projectId/checklists`
- `POST /api/projects/:projectId/checklists`
- `GET /api/project-checklists/:checklistId`
- `PATCH /api/project-checklists/:checklistId/items/:itemId`
- `POST /api/project-checklists/items/:itemId/attachments`

Timer/okonomi:

- `GET /api/projects/:projectId/time-entries`
- `POST /api/projects/:projectId/time-entries`
- `GET /api/time-entries/:timeEntryId`
- `PATCH /api/time-entries/:timeEntryId`
- `DELETE /api/time-entries/:timeEntryId`

Tilbud:

- `GET /api/offers`
- `POST /api/offers`
- `GET /api/offers/:offerId`
- `PATCH /api/offers/:offerId` (kun `UTKAST`)
- `POST /api/offers/:offerId/status` (statusflyt)
- `GET /api/offers/:offerId/pdf` (PDF)

## Vedleggslagring

Bildevedlegg lagres lokalt under:

- `public/uploads/checklist-attachments`

Databasen lagrer filreferanse i `ChecklistItemAttachment.filUrl`.

## Miljovariabler

Kopier `.env.example` til `.env` og oppdater ved behov:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## Kjor lokalt

1. Installer avhengigheter:

```bash
npm install
```

2. Kopier miljofil (PowerShell):

```powershell
Copy-Item .env.example .env
```

3. Start database:

```bash
docker compose up -d
```

4. Kjor migrasjoner og generer Prisma client:

```bash
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
```

5. Seed admin-bruker:

```bash
npm.cmd run prisma:seed
```

6. Start app:

```bash
npm.cmd run dev
```

Appen kjorer pa `http://localhost:3000`.

## Logg inn

1. Ga til `http://localhost:3000/login`.
2. Bruk verdiene fra `.env`:
   - e-post: `SEED_ADMIN_EMAIL`
   - passord: `SEED_ADMIN_PASSWORD`

Standardverdier fra `.env.example`:

- e-post: `admin@bjerke.no`
- passord: `ChangeMe123!`
