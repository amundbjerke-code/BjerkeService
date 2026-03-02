-- CreateTable
CREATE TABLE "ProjectProductDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tittel" TEXT NOT NULL,
    "filUrl" TEXT NOT NULL,
    "filType" TEXT NOT NULL,
    "notat" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFdvHandover" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerSignature" TEXT NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFdvHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectProductDocument_projectId_idx" ON "ProjectProductDocument"("projectId");

-- CreateIndex
CREATE INDEX "ProjectProductDocument_createdById_idx" ON "ProjectProductDocument"("createdById");

-- CreateIndex
CREATE INDEX "ProjectProductDocument_createdAt_idx" ON "ProjectProductDocument"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFdvHandover_projectId_key" ON "ProjectFdvHandover"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFdvHandover_signedAt_idx" ON "ProjectFdvHandover"("signedAt");

-- CreateIndex
CREATE INDEX "ProjectFdvHandover_createdById_idx" ON "ProjectFdvHandover"("createdById");

-- AddForeignKey
ALTER TABLE "ProjectProductDocument" ADD CONSTRAINT "ProjectProductDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductDocument" ADD CONSTRAINT "ProjectProductDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFdvHandover" ADD CONSTRAINT "ProjectFdvHandover_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFdvHandover" ADD CONSTRAINT "ProjectFdvHandover_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
