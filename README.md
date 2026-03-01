# Bjerke Service App

Mobil-first prosjektstyring for Bjerke Service.

## Bolge 1-2 status

Ferdig i denne leveransen:

- Grunnprosjekt med Next.js + TypeScript + Tailwind
- Rollebasert auth med Auth.js credentials
- Roller: `ADMIN` og `EMPLOYEE`
- Beskyttede sider via server-side guards
- Toppmeny + sidenavigasjon (desktop) + bunnnavigasjon (mobil)
- Startsider:
  - `/dashboard` (tom forelopig)
  - `/kunder` (Bolge 2 implementert)
  - `/prosjekter` (placeholder)
  - `/sjekklister` (placeholder)
  - `/timer` (placeholder)
  - `/rapport` (placeholder)
- Kunder:
  - CRUD (opprett, les, rediger, deaktiver via status)
  - Hurtigsok + filtrering (navn/telefon/e-post + status)
  - Kundedetaljer med mobil-lenker for ring og e-post
  - Prosjektliste placeholder (Bolge 3)
- Admin-side for brukeropprettelse: `/admin/users`
- Database med Prisma migrasjoner + seed for admin-bruker

## Teknologistack

- `Next.js` 15
- `TypeScript`
- `Auth.js (next-auth)` med `@auth/prisma-adapter`
- `PostgreSQL`
- `Prisma ORM`
- `Zod`

## Datamodell (Bolge 1-2)

Se [prisma/schema.prisma](./prisma/schema.prisma).

Kjernetabeller:

- `User` (inkludert `role`)
- `Account`, `Session`, `VerificationToken` (Auth.js)
- `AuditLog`
- `Customer` (med `status`: `ACTIVE`/`INACTIVE`)

## API-endepunkter (Bolge 2 kunder)

- `GET /api/customers` - liste kunder med sok/filter
- `POST /api/customers` - opprett kunde
- `GET /api/customers/:customerId` - hent kunde + prosjekt-placeholder
- `PATCH /api/customers/:customerId` - oppdater kunde
- `DELETE /api/customers/:customerId` - deaktiver kunde (soft delete via status)

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
npm run prisma:migrate
npm run prisma:generate
```

5. Seed admin-bruker:

```bash
npm run prisma:seed
```

6. Start app:

```bash
npm run dev
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
