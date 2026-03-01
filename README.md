# Bjerke Service App

Mobil-first prosjektstyring for Bjerke Service.

## Stack (BÃ¸lge 1)

- `Next.js` + `TypeScript` + `React`
- `Auth.js (next-auth)` med credentials login
- `PostgreSQL` + `Prisma ORM`
- `Tailwind CSS` + egen designprofil med Bjerke-farger
- `Zod` for inputvalidering

## Datamodell (BÃ¸lge 1)

Implementert i [`prisma/schema.prisma`](./prisma/schema.prisma):

- `User` (rolle: `ADMIN` / `EMPLOYEE`)
- `Account`, `Session`, `VerificationToken` (Auth.js adapter-tabeller)
- `AuditLog` (revisjonsspor med aktÃ¸r, handling, entitet og metadata)

## API-endepunkter (BÃ¸lge 1)

- `GET /api/me` - returnerer innlogget bruker
- `GET /api/audit` - admin-only, siste revisjonslogger
- `GET /api/users` - admin-only, liste brukere
- `POST /api/users` - admin-only, opprett bruker med validering + hash + audit
- `GET|POST /api/auth/[...nextauth]` - Auth.js handler

## UI-sider (BÃ¸lge 1)

- `/login` - innlogging
- `/dashboard` - mobil-first startside etter login
- `/admin/users` - admin-side for brukeropprettelse og oversikt

Logo vises i toppbar pÃ¥ alle sider (`/public/bjerke-logo.svg`), med fargepalett:

- PrimÃ¦r rÃ¸d: `#DD1F2A`
- MÃ¸rk rÃ¸d hover: `#B71C24`
- Bakgrunn: `#F3F3F3`
- Tekst: `#1F2937`
- Kort: `#FFFFFF`

## KjÃ¸r lokalt

1. Installer avhengigheter:
```bash
npm install
```
2. Kopier miljÃ¸fil (PowerShell):
```powershell
Copy-Item .env.example .env
```
3. Start database:
```bash
docker compose up -d
```
4. KjÃ¸r migrasjoner + generer Prisma client:
```bash
npm run prisma:migrate
npm run prisma:generate
```
5. Seed fÃ¸rste admin:
```bash
npm run prisma:seed
```
6. Start app:
```bash
npm run dev
```

Appen kjÃ¸rer pÃ¥ `http://localhost:3000`.


