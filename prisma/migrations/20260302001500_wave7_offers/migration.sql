-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('FASTPRIS', 'TIMEBASERT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('UTKAST', 'SENDT', 'GODKJENT', 'AVVIST');

-- CreateEnum
CREATE TYPE "OfferHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'CONVERTED_TO_PROJECT');

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "navn" TEXT NOT NULL,
    "beskrivelse" TEXT,
    "offerType" "OfferType" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'UTKAST',
    "timeEstimateHours" DOUBLE PRECISION NOT NULL,
    "hourlyRateEksMva" DOUBLE PRECISION NOT NULL,
    "materialCostEksMva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskBufferPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalEksMva" DOUBLE PRECISION NOT NULL,
    "markupAmountEksMva" DOUBLE PRECISION NOT NULL,
    "riskAmountEksMva" DOUBLE PRECISION NOT NULL,
    "totalEksMva" DOUBLE PRECISION NOT NULL,
    "mvaPercent" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "totalInkMva" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "convertedToProjectAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSpecificationItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "rekkefolge" INTEGER NOT NULL,
    "belopEksMva" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferSpecificationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferHistory" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "action" "OfferHistoryAction" NOT NULL,
    "fromStatus" "OfferStatus",
    "toStatus" "OfferStatus",
    "note" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_projectId_key" ON "Offer"("projectId");

-- CreateIndex
CREATE INDEX "Offer_customerId_idx" ON "Offer"("customerId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_offerType_idx" ON "Offer"("offerType");

-- CreateIndex
CREATE INDEX "Offer_createdById_idx" ON "Offer"("createdById");

-- CreateIndex
CREATE INDEX "Offer_updatedById_idx" ON "Offer"("updatedById");

-- CreateIndex
CREATE INDEX "Offer_createdAt_idx" ON "Offer"("createdAt");

-- CreateIndex
CREATE INDEX "OfferSpecificationItem_offerId_idx" ON "OfferSpecificationItem"("offerId");

-- CreateIndex
CREATE INDEX "OfferSpecificationItem_rekkefolge_idx" ON "OfferSpecificationItem"("rekkefolge");

-- CreateIndex
CREATE INDEX "OfferHistory_offerId_idx" ON "OfferHistory"("offerId");

-- CreateIndex
CREATE INDEX "OfferHistory_changedById_idx" ON "OfferHistory"("changedById");

-- CreateIndex
CREATE INDEX "OfferHistory_createdAt_idx" ON "OfferHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferSpecificationItem" ADD CONSTRAINT "OfferSpecificationItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferHistory" ADD CONSTRAINT "OfferHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferHistory" ADD CONSTRAINT "OfferHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
