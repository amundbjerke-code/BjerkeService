-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "orgnr" TEXT,
    "epost" TEXT NOT NULL,
    "telefon" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "postnr" TEXT NOT NULL,
    "poststed" TEXT NOT NULL,
    "notater" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_navn_idx" ON "Customer"("navn");

-- CreateIndex
CREATE INDEX "Customer_telefon_idx" ON "Customer"("telefon");

-- CreateIndex
CREATE INDEX "Customer_epost_idx" ON "Customer"("epost");
