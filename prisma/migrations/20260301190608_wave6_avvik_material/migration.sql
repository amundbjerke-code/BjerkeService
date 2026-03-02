-- CreateEnum
CREATE TYPE "AvvikAlvorlighetsgrad" AS ENUM ('LAV', 'MIDDELS', 'HOY', 'KRITISK');

-- CreateEnum
CREATE TYPE "AvvikStatus" AS ENUM ('APENT', 'UNDER_BEHANDLING', 'LUKKET');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('TRENGS', 'BESTILT', 'MOTTATT');

-- CreateTable
CREATE TABLE "Avvik" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tittel" TEXT NOT NULL,
    "beskrivelse" TEXT NOT NULL,
    "alvorlighetsgrad" "AvvikAlvorlighetsgrad" NOT NULL,
    "status" "AvvikStatus" NOT NULL DEFAULT 'APENT',
    "tiltak" TEXT,
    "registrertAvId" TEXT NOT NULL,
    "lukketAvId" TEXT,
    "lukketDato" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avvik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvvikAttachment" (
    "id" TEXT NOT NULL,
    "avvikId" TEXT NOT NULL,
    "filUrl" TEXT NOT NULL,
    "filType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvvikAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "antall" DOUBLE PRECISION NOT NULL,
    "enhet" TEXT NOT NULL,
    "estimertPris" DOUBLE PRECISION,
    "status" "MaterialStatus" NOT NULL DEFAULT 'TRENGS',
    "notat" TEXT,
    "lagtTilAvId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Avvik_projectId_idx" ON "Avvik"("projectId");

-- CreateIndex
CREATE INDEX "Avvik_status_idx" ON "Avvik"("status");

-- CreateIndex
CREATE INDEX "Avvik_alvorlighetsgrad_idx" ON "Avvik"("alvorlighetsgrad");

-- CreateIndex
CREATE INDEX "Avvik_registrertAvId_idx" ON "Avvik"("registrertAvId");

-- CreateIndex
CREATE INDEX "Avvik_createdAt_idx" ON "Avvik"("createdAt");

-- CreateIndex
CREATE INDEX "AvvikAttachment_avvikId_idx" ON "AvvikAttachment"("avvikId");

-- CreateIndex
CREATE INDEX "MaterialItem_projectId_idx" ON "MaterialItem"("projectId");

-- CreateIndex
CREATE INDEX "MaterialItem_status_idx" ON "MaterialItem"("status");

-- CreateIndex
CREATE INDEX "MaterialItem_lagtTilAvId_idx" ON "MaterialItem"("lagtTilAvId");

-- AddForeignKey
ALTER TABLE "Avvik" ADD CONSTRAINT "Avvik_registrertAvId_fkey" FOREIGN KEY ("registrertAvId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avvik" ADD CONSTRAINT "Avvik_lukketAvId_fkey" FOREIGN KEY ("lukketAvId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvvikAttachment" ADD CONSTRAINT "AvvikAttachment_avvikId_fkey" FOREIGN KEY ("avvikId") REFERENCES "Avvik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialItem" ADD CONSTRAINT "MaterialItem_lagtTilAvId_fkey" FOREIGN KEY ("lagtTilAvId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
