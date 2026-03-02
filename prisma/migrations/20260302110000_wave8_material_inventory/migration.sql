-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('UTKAST', 'SENDT', 'MOTTATT', 'ANNULLERT');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "kontaktperson" TEXT,
    "epost" TEXT,
    "telefon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMaterial" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "navn" TEXT NOT NULL,
    "enhet" TEXT NOT NULL,
    "innkjopsprisEksMva" DOUBLE PRECISION NOT NULL,
    "standardPaslagPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lagerBeholdning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lavLagerGrense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMaterialConsumption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "dato" TIMESTAMP(3) NOT NULL,
    "antall" DOUBLE PRECISION NOT NULL,
    "enhet" TEXT NOT NULL,
    "enhetsInnkjopsprisEksMva" DOUBLE PRECISION NOT NULL,
    "enhetsSalgsprisEksMva" DOUBLE PRECISION NOT NULL,
    "notat" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMaterialConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'UTKAST',
    "forventetDato" TIMESTAMP(3),
    "notat" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "antall" DOUBLE PRECISION NOT NULL,
    "enhetsprisEksMva" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_navn_idx" ON "Supplier"("navn");

-- CreateIndex
CREATE INDEX "InventoryMaterial_supplierId_idx" ON "InventoryMaterial"("supplierId");

-- CreateIndex
CREATE INDEX "InventoryMaterial_navn_idx" ON "InventoryMaterial"("navn");

-- CreateIndex
CREATE INDEX "InventoryMaterial_lagerBeholdning_idx" ON "InventoryMaterial"("lagerBeholdning");

-- CreateIndex
CREATE INDEX "ProjectMaterialConsumption_projectId_idx" ON "ProjectMaterialConsumption"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMaterialConsumption_materialId_idx" ON "ProjectMaterialConsumption"("materialId");

-- CreateIndex
CREATE INDEX "ProjectMaterialConsumption_dato_idx" ON "ProjectMaterialConsumption"("dato");

-- CreateIndex
CREATE INDEX "ProjectMaterialConsumption_createdById_idx" ON "ProjectMaterialConsumption"("createdById");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_materialId_idx" ON "PurchaseOrderItem"("materialId");

-- AddForeignKey
ALTER TABLE "InventoryMaterial" ADD CONSTRAINT "InventoryMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialConsumption" ADD CONSTRAINT "ProjectMaterialConsumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialConsumption" ADD CONSTRAINT "ProjectMaterialConsumption_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "InventoryMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialConsumption" ADD CONSTRAINT "ProjectMaterialConsumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "InventoryMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
