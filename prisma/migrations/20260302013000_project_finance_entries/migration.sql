-- CreateEnum
CREATE TYPE "ProjectFinanceEntryType" AS ENUM ('UTGIFT', 'TILLEGG');

-- CreateTable
CREATE TABLE "ProjectFinanceEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProjectFinanceEntryType" NOT NULL,
    "dato" TIMESTAMP(3) NOT NULL,
    "beskrivelse" TEXT NOT NULL,
    "belopEksMva" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFinanceEntry_projectId_idx" ON "ProjectFinanceEntry"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFinanceEntry_type_idx" ON "ProjectFinanceEntry"("type");

-- CreateIndex
CREATE INDEX "ProjectFinanceEntry_dato_idx" ON "ProjectFinanceEntry"("dato");

-- CreateIndex
CREATE INDEX "ProjectFinanceEntry_createdById_idx" ON "ProjectFinanceEntry"("createdById");

-- AddForeignKey
ALTER TABLE "ProjectFinanceEntry" ADD CONSTRAINT "ProjectFinanceEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFinanceEntry" ADD CONSTRAINT "ProjectFinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;