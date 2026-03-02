-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('FERIE', 'SYK', 'PERMISJON', 'ANNET');

-- CreateEnum
CREATE TYPE "TimeEntryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "approvalComment" TEXT,
ADD COLUMN     "approvalStatus" "TimeEntryApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telefon" TEXT,
    "stilling" TEXT,
    "fagbrev" TEXT,
    "sertifikater" TEXT,
    "kompetanseNotat" TEXT,
    "timeLonnPerTime" DOUBLE PRECISION,
    "internKostPerTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAbsence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "startDato" TIMESTAMP(3) NOT NULL,
    "sluttDato" TIMESTAMP(3) NOT NULL,
    "notat" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_userId_idx" ON "EmployeeAbsence"("userId");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_type_idx" ON "EmployeeAbsence"("type");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_startDato_idx" ON "EmployeeAbsence"("startDato");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_sluttDato_idx" ON "EmployeeAbsence"("sluttDato");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_createdById_idx" ON "EmployeeAbsence"("createdById");

-- CreateIndex
CREATE INDEX "TimeEntry_approvalStatus_idx" ON "TimeEntry"("approvalStatus");

-- CreateIndex
CREATE INDEX "TimeEntry_approvedById_idx" ON "TimeEntry"("approvedById");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAbsence" ADD CONSTRAINT "EmployeeAbsence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAbsence" ADD CONSTRAINT "EmployeeAbsence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
