-- CreateEnum
CREATE TYPE "ChecklistItemAnswer" AS ENUM ('JA', 'NEI', 'IKKE_RELEVANT');

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "rekkefolge" INTEGER NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "rekkefolge" INTEGER NOT NULL,
    "svar" "ChecklistItemAnswer",
    "kommentar" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemAttachment" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "filUrl" TEXT NOT NULL,
    "filType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItemAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_navn_idx" ON "ChecklistTemplate"("navn");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_kategori_idx" ON "ChecklistTemplate"("kategori");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_rekkefolge_idx" ON "ChecklistTemplateItem"("rekkefolge");

-- CreateIndex
CREATE INDEX "ProjectChecklist_projectId_idx" ON "ProjectChecklist"("projectId");

-- CreateIndex
CREATE INDEX "ProjectChecklist_createdById_idx" ON "ProjectChecklist"("createdById");

-- CreateIndex
CREATE INDEX "ProjectChecklist_createdAt_idx" ON "ProjectChecklist"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_checklistId_idx" ON "ProjectChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_rekkefolge_idx" ON "ProjectChecklistItem"("rekkefolge");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_updatedById_idx" ON "ProjectChecklistItem"("updatedById");

-- CreateIndex
CREATE INDEX "ChecklistItemAttachment_checklistItemId_idx" ON "ChecklistItemAttachment"("checklistItemId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ProjectChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemAttachment" ADD CONSTRAINT "ChecklistItemAttachment_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ProjectChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
