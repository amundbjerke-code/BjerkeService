# Session Handoff (2026-03-02)

## Status
- Bolge 7 er ferdig (rapportintegrasjon + redigering av okonomiposter).
- Bolge 8 (Material- og Lagerstyring) er implementert.

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

## Viktige filer endret i dag
- prisma/schema.prisma
- prisma/migrations/20260302110000_wave8_material_inventory/migration.sql
- app/actions/material-inventory-actions.ts
- app/(protected)/materialer/page.tsx
- app/(protected)/prosjekter/[projectId]/page.tsx
- components/app-nav.tsx
- lib/material-inventory-meta.ts
- README.md

## Migrasjon / DB
- Ny migrasjon lagt til og kjort:
  - `20260302110000_wave8_material_inventory`
- Prisma client regenerert.

## Verifisering kjort
- npm.cmd run prisma:migrate
- npm.cmd run prisma:generate
- .\\node_modules\\.bin\\tsc.cmd --noEmit
- npm.cmd run build

## Drift
- Dev-server er ikke startet i denne sesjonen.
- Start med: `npm.cmd run dev`

## Neste naturlige steg
1. Legg til redigering/sletting av leverandorer/materialer i registeret.
2. Legg til statusflyt for innkjopsordre (`SENDT`, `ANNULLERT`) i UI.
3. Vurder automatisk forslag til ordreantall basert pa historisk forbruk (ikke bare lavlager-grense).
