# Bjerke Service App

Mobil-first prosjektstyring for Bjerke Service.

## Bolge 1-4 status

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

## Tilgangsvalg (Bolge 4)

Prosjekt- og sjekklistetilgang er satt til default policy:

- Alle innloggede brukere (`ADMIN` og `EMPLOYEE`) kan se alle prosjekter og sjekklister.

Dette er valgt fordi prosjekt-eierskap ikke er modellert enna.

## Teknologistack

- `Next.js` 15
- `TypeScript`
- `Auth.js (next-auth)` med `@auth/prisma-adapter`
- `PostgreSQL`
- `Prisma ORM`
- `Zod`

## Datamodell (Bolge 1-4)

Se [prisma/schema.prisma](./prisma/schema.prisma).

Kjernetabeller:

- `User` (inkludert `role`)
- `Account`, `Session`, `VerificationToken` (Auth.js)
- `AuditLog`
- `Customer`
- `Project`
- `ChecklistTemplate`
- `ChecklistTemplateItem`
- `ProjectChecklist`
- `ProjectChecklistItem`
- `ChecklistItemAttachment`

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
