# Session Handoff (2026-03-02)

## Status
- Bolge 7 er ferdig (rapportintegrasjon + redigering av okonomiposter).
- Bolge 8 (Material- og Lagerstyring) er implementert.
- Oppfolging etter Bolge 8 er implementert:
  - CRUD for leverandorer/materialer i registeret
  - Innkjopsordre statusflyt i UI (`SENDT`, `ANNULLERT`)
  - Smartere auto-forslag til ordreantall basert pa historisk forbruk
- Bolge 9 (Avansert okonomi-dashboard) er implementert.
- Bolge 10 (Ansattmodul / HR Light) er implementert.
- Bolge 11 (Bulk-godkjenning + sertifikatvarsling) er implementert.
- Bolge 12 (Planlegging & Ressursstyring) er implementert.
- Bolge 13 (Dokumentasjon & FDV-modul) er implementert.

## Levert i Bolge 8
- Eget materialregister med:
  - Leverandor (`Supplier`)
  - Innkjopspris og standard paslag (`InventoryMaterial`)
  - Lagerbeholdning og lavlager-grense
- Materialforbruk per prosjekt (`ProjectMaterialConsumption`):
  - Uttak fra lager pa prosjektsiden
  - Automatisk lager-trekk
  - Automatisk kostnadsforing som `UTGIFT` i prosjektokonomi
- Lavlager-varsel pa `/materialer` og pa prosjektsiden.
- Innkjopsordre (`PurchaseOrder` + `PurchaseOrderItem`):
  - Auto-generering fra lavlager-linjer
  - Markering som mottatt med automatisk lager-okning
- Ny menyinngang: `Materialer`.

## Levert i oppfolging (2026-03-02)
- Leverandorer:
  - Redigering av eksisterende leverandoropplysninger
  - Sletting nar leverandor ikke har avhengige materialer/ordrer
- Materialer:
  - Redigering av leverandor, navn, enhet, pris, paslag og lavlager-grense
  - Sletting nar materialet ikke er brukt i forbruk eller ordrelinjer
- Innkjopsordre:
  - `UTKAST` kan markeres som `SENDT`
  - `UTKAST` og `SENDT` kan annulleres (`ANNULLERT`)
  - `MOTTATT` er kun tillatt fra `SENDT` (forhindrer direkte mottak fra `UTKAST`)
- Smart ordreantall:
  - Auto-generering bruker lavlager + forbruk siste 90 dager
  - Dekningslogikk med 45 dagers estimert behov

## Levert i Bolge 9 (2026-03-02)
- Ny dashboard-side med sanntids KPI-er:
  - Omsetning siste 30/90 dager
  - Fakturerbart vs ikke fakturerbart arbeid
  - Dekningsgrad per prosjekt (valgt periode: 30 eller 90 dager)
  - Mest lonnsomme prosjekt-type
  - Ansatt-produktivitet (fakturerbar timer-prosent)
  - Likviditetsprognose 30/60/90 dager basert pa 90-dagers run-rate
- Mobilvennlig layout med responsive KPI-kort og tabeller.

## Levert i Bolge 10 (2026-03-02)
- Datamodell:
  - `EmployeeProfile` for ansattprofil/kompetanse/lonn og internkost
  - `EmployeeAbsence` for fravaer (syk, ferie, permisjon, annet)
  - Timegodkjenning pa `TimeEntry` (`PENDING`, `APPROVED`, `REJECTED`)
- Ny admin HR-side pa `/admin/users`:
  - Ansattprofiler med rolle, stilling, fagbrev, sertifikater og kompetansenotat
  - Timelonn og internkost per ansatt
  - Fravaersregistrering og sletting
  - Panel for godkjenning/avvisning/nullstilling av timer
- Timeflyt:
  - Nye timer arver internkost fra ansattprofil
  - Nye/endrede timer settes til `PENDING`
  - Kun admin kan godkjenne timer for fakturering
- Okonomi/rapport:
  - Fakturagrunnlag bruker kun godkjente fakturerbare timer
  - Kostgrunnlag bruker internkost pa timer der tilgjengelig
  - Oppdatert i prosjektokonomi, rapport og dashboard

## Levert i Bolge 11 (2026-03-02)
- Timegodkjenning:
  - Bulk-godkjenning av ventende timer per prosjekt og datoperiode
  - Egne server actions for bulk-godkjenning med audit logging
- Dashboard:
  - Nytt varsel for andel ventende fakturagrunnlag i valgt 30/90-dagersvindu
  - Viser ventende belop/timer og hurtiglenke til `/admin/users`
- HR / sertifikater:
  - Ny datamodell `EmployeeCertificate` med `gyldigTil`
  - Registrering og sletting av sertifikater fra HR-siden
  - Varselpanel for utlopte/utlopende sertifikater (30 dager)
  - Statusmerking per sertifikat pa ansattkort (`utlopt`, `utloper i dag`, `utloper snart`, `gyldig`)

## Levert i Bolge 12 (2026-03-02)
- Ny modul `/planlegging` (admin):
  - Kalender med ansatte (rader) og datoer (kolonner)
  - Prosjektkort som kan dras inn i kalenderen for a opprette bemanningslinjer
  - Eksisterende bemanningslinjer kan dras mellom ansatte/datoer
  - Timer pa bemanningslinjer kan justeres direkte i kalenderen
- Kapasitet og varsel:
  - Kapasitetsoversikt fremover per dag (booket vs kapasitet)
  - Overbooking-varsel med liste over overbookede ansatt-dager
  - Fravaer tas med i kapasitetsberegningen
- Automatisk bemanningsforslag:
  - API som beregner forslag basert pa prosjektstorrelse og tilgjengelig kapasitet
  - Stotte for preview og direkte innlegging av forslag i plan
- Datamodell/API:
  - Ny tabell `ProjectStaffingAssignment`
  - Nye API-endepunkter under `/api/planning/*`

## Levert i Bolge 13 (2026-03-02)
- Ny FDV-modul per prosjekt:
  - Egen side pa `/prosjekter/:projectId/fdv`
  - Hurtiglenke fra prosjektsiden (`Dokumenter` + seksjonsnavigasjon)
- Automatisk FDV-innhold:
  - Sjekklistesammendrag (besvart/total + bildemengde)
  - Bildesamling fra sjekklistevedlegg og avviksvedlegg
  - Produktdokumentasjon for prosjekt
- Produktdokumentasjon:
  - Opplasting av fil med tittel/notat (`ProjectProductDocument`)
  - Sletting av opplastede dokumenter
- FDV-PDF:
  - Ny PDF-generator pa `/api/prosjekter/:projectId/fdv-pdf`
  - Inkluderer sammendrag, sjekklister, produktdokumenter, signeringsstatus og bildeseksjon
- Signering ved overlevering:
  - Ny signeringsflyt med kunde, kundesignatur (navn), signert av (Bjerke) og dato
  - Lagres/oppdateres pa prosjekt (`ProjectFdvHandover`)

## Viktige filer endret i dag
- prisma/schema.prisma
- prisma/migrations/20260302110000_wave8_material_inventory/migration.sql
- app/actions/material-inventory-actions.ts
- app/(protected)/materialer/page.tsx
- app/(protected)/prosjekter/[projectId]/page.tsx
- components/app-nav.tsx
- lib/material-inventory-meta.ts
- README.md

## Viktige filer endret i oppfolging
- app/actions/material-inventory-actions.ts
- app/(protected)/materialer/page.tsx
- app/(protected)/dashboard/page.tsx
- README.md
- SESSION_HANDOFF.md

## Viktige filer endret i Bolge 10
- prisma/schema.prisma
- prisma/migrations/20260302184050_wave10_hr_light/migration.sql
- app/actions/hr-actions.ts
- app/actions/time-entry-actions.ts
- app/(protected)/admin/users/page.tsx
- app/(protected)/timer/page.tsx
- app/(protected)/prosjekter/[projectId]/page.tsx
- app/(protected)/rapport/page.tsx
- app/(protected)/dashboard/page.tsx
- app/api/projects/[projectId]/time-entries/route.ts
- app/api/time-entries/[timeEntryId]/route.ts
- app/api/rapport/csv/route.ts
- components/app-nav.tsx
- lib/time-entry-meta.ts
- README.md
- SESSION_HANDOFF.md

## Viktige filer endret i Bolge 11
- prisma/schema.prisma
- prisma/migrations/20260302211000_wave11_bulk_approval_and_certificate_alerts/migration.sql
- app/actions/hr-actions.ts
- app/(protected)/admin/users/page.tsx
- app/(protected)/dashboard/page.tsx
- README.md
- SESSION_HANDOFF.md

## Viktige filer endret i Bolge 12
- prisma/schema.prisma
- prisma/migrations/20260302225000_wave12_planning_resource_management/migration.sql
- lib/planning.ts
- app/(protected)/planlegging/page.tsx
- components/planning-board.tsx
- app/api/planning/assignments/route.ts
- app/api/planning/assignments/[assignmentId]/route.ts
- app/api/planning/suggestions/route.ts
- components/app-nav.tsx
- README.md
- SESSION_HANDOFF.md

## Viktige filer endret i Bolge 13
- prisma/schema.prisma
- prisma/migrations/20260302233500_wave13_fdv_module/migration.sql
- app/actions/fdv-actions.ts
- app/(protected)/prosjekter/[projectId]/fdv/page.tsx
- app/api/prosjekter/[projectId]/fdv-pdf/route.ts
- app/(protected)/prosjekter/[projectId]/page.tsx
- README.md
- SESSION_HANDOFF.md

## Migrasjon / DB
- Ny migrasjon lagt til og kjort:
  - `20260302110000_wave8_material_inventory`
  - `20260302184050_wave10_hr_light`
  - `20260302211000_wave11_bulk_approval_and_certificate_alerts`
  - `20260302225000_wave12_planning_resource_management`
  - `20260302233500_wave13_fdv_module`
- Prisma client regenerert.

## Verifisering kjort
- npm.cmd run prisma:migrate
- npm.cmd run prisma:generate
- .\\node_modules\\.bin\\tsc.cmd --noEmit
- npm.cmd run build
- .\\node_modules\\.bin\\tsc.cmd --noEmit (oppfolging)
- npm.cmd run build (oppfolging)
- .\\node_modules\\.bin\\tsc.cmd --noEmit (Bolge 9)
- npm.cmd run build (Bolge 9)
- npm.cmd run prisma:migrate -- --name wave10_hr_light
- npm.cmd run prisma:generate
- .\\node_modules\\.bin\\tsc.cmd --noEmit (Bolge 10)
- npm.cmd run build (Bolge 10)
- npm.cmd run prisma:migrate (Bolge 11)
- npm.cmd run prisma:generate (Bolge 11)
- .\\node_modules\\.bin\\tsc.cmd --noEmit (Bolge 11)
- npm.cmd run build (Bolge 11)
- npm.cmd run prisma:migrate (Bolge 12)
- npm.cmd run prisma:generate (Bolge 12)
- .\\node_modules\\.bin\\tsc.cmd --noEmit (Bolge 12)
- npm.cmd run build (Bolge 12)
- npm.cmd run prisma:migrate (Bolge 13)
- npm.cmd run prisma:generate (Bolge 13)
- .\\node_modules\\.bin\\tsc.cmd --noEmit (Bolge 13)
- npm.cmd run build (Bolge 13)

## Drift
- Dev-server er ikke startet i denne sesjonen.
- Start med: `npm.cmd run dev`

## Neste naturlige steg
1. Legg til faktisk frihand-signatur (tegning pa skjerm) i stedet for kun navnesignatur.
2. Legg til versjonering av FDV-pakke (v1, v2, ... ) med historikk.
3. Legg til e-postutsendelse av FDV-PDF direkte til kunde ved overlevering.
