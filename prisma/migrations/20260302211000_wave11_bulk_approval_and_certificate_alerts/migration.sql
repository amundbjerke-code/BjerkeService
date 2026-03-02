-- CreateTable
CREATE TABLE "EmployeeCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "gyldigTil" TIMESTAMP(3) NOT NULL,
    "notat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeCertificate_userId_idx" ON "EmployeeCertificate"("userId");

-- CreateIndex
CREATE INDEX "EmployeeCertificate_gyldigTil_idx" ON "EmployeeCertificate"("gyldigTil");

-- AddForeignKey
ALTER TABLE "EmployeeCertificate" ADD CONSTRAINT "EmployeeCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
