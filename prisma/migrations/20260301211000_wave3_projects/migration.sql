-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANLAGT', 'PAGAR', 'FERDIG', 'FAKTURERT');

-- CreateEnum
CREATE TYPE "ProjectBillingType" AS ENUM ('TIME', 'FASTPRIS');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "beskrivelse" TEXT,
    "adresse" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANLAGT',
    "billingType" "ProjectBillingType" NOT NULL DEFAULT 'TIME',
    "fastprisBelopEksMva" DOUBLE PRECISION,
    "timeprisEksMva" DOUBLE PRECISION,
    "startDato" TIMESTAMP(3) NOT NULL,
    "sluttDato" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_navn_idx" ON "Project"("navn");

-- CreateIndex
CREATE INDEX "Project_billingType_idx" ON "Project"("billingType");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
