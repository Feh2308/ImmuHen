-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "domain" TEXT,
    "logoDataUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#16a34a',
    "secondaryColor" TEXT NOT NULL DEFAULT '#dcfce7',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_identifier_key" ON "Tenant"("identifier");

-- Seed tenant rows for records that may already exist before this migration.
INSERT INTO "Tenant" ("id", "name", "identifier", "updatedAt")
VALUES ('legacy', 'Legacy', 'legacy', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Tenant" ("id", "name", "identifier", "updatedAt")
SELECT DISTINCT "tenantId", "tenantId", "tenantId", CURRENT_TIMESTAMP
FROM "BirdLot"
WHERE "tenantId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Tenant" ("id", "name", "identifier", "updatedAt")
SELECT DISTINCT "tenantId", "tenantId", "tenantId", CURRENT_TIMESTAMP
FROM "AppUser"
WHERE "tenantId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "BirdLot" ADD CONSTRAINT "BirdLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
