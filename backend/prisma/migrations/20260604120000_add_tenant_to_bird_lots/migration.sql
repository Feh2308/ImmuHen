ALTER TABLE "BirdLot" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX "BirdLot_tenantId_idx" ON "BirdLot"("tenantId");
