-- CreateTable
CREATE TABLE "ProjectStaffingAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dato" TIMESTAMP(3) NOT NULL,
    "timer" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStaffingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectStaffingAssignment_projectId_idx" ON "ProjectStaffingAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectStaffingAssignment_userId_idx" ON "ProjectStaffingAssignment"("userId");

-- CreateIndex
CREATE INDEX "ProjectStaffingAssignment_dato_idx" ON "ProjectStaffingAssignment"("dato");

-- CreateIndex
CREATE INDEX "ProjectStaffingAssignment_createdById_idx" ON "ProjectStaffingAssignment"("createdById");

-- AddForeignKey
ALTER TABLE "ProjectStaffingAssignment" ADD CONSTRAINT "ProjectStaffingAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStaffingAssignment" ADD CONSTRAINT "ProjectStaffingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStaffingAssignment" ADD CONSTRAINT "ProjectStaffingAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
