-- Phase 1 SaaS foundation for ImmuHen.
-- Additive only: no DROP, no TRUNCATE, no UPDATE of existing production data.
-- AppState.data remains untouched and continues as the current operational source.

CREATE TABLE IF NOT EXISTS "FarmProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "farmName" TEXT NOT NULL,
  "city" TEXT,
  "document" TEXT,
  "owner" TEXT,
  "locationUrl" TEXT,
  "notificationContact" TEXT,
  "logoDataUrl" TEXT,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "ranches" JSONB,
  "importantContacts" JSONB,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FarmProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Vaccine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "manufacturer" TEXT,
  "dosesPerBottle" DECIMAL(14,4),
  "defaultDosePerBirdCc" DECIMAL(14,4),
  "valuePerDose" DECIMAL(14,6),
  "notes" TEXT,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vaccine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaccineEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vaccineId" TEXT,
  "lot" TEXT,
  "expiresAt" TIMESTAMP(3),
  "bottles" DECIMAL(14,4),
  "dosesPerBottle" DECIMAL(14,4),
  "doses" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "valuePerDose" DECIMAL(14,6),
  "totalValue" DECIMAL(14,2),
  "supplier" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaccineEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vaccineId" TEXT,
  "birdLotId" INTEGER,
  "type" TEXT NOT NULL,
  "source" TEXT,
  "sourceId" TEXT,
  "doses" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,6),
  "totalCost" DECIMAL(14,2),
  "notes" TEXT,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockAlert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vaccineId" TEXT,
  "minimumQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastTriggeredAt" TIMESTAMP(3),
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaccinationSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vaccinatorId" TEXT,
  "birdLotId" INTEGER,
  "programId" TEXT,
  "programDay" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "payload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaccinationSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaccinationRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "vaccinatorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaccinationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompletedVaccination" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestId" TEXT,
  "scheduleId" TEXT,
  "vaccinatorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "completedAt" TIMESTAMP(3),
  "payload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletedVaccination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemperaturePhoto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestId" TEXT,
  "completedVaccinationId" TEXT,
  "imageUrl" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemperaturePhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DoseRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestId" TEXT,
  "vaccinatorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "items" JSONB,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "vaccinatorId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "oldValue" JSONB,
  "newValue" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "plan" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "graceUntil" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "lastPaymentAt" TIMESTAMP(3),
  "provider" TEXT,
  "providerCustomerId" TEXT,
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "provider" TEXT,
  "providerPaymentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "paidAt" TIMESTAMP(3),
  "payload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaccinatorTenantLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vaccinatorId" INTEGER,
  "vaccinatorEmail" TEXT NOT NULL,
  "vaccinatorPhone" TEXT,
  "vaccinatorName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "linkedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaccinatorTenantLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FarmProfile_tenantId_key" ON "FarmProfile"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "Vaccine_tenantId_code_key" ON "Vaccine"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Vaccine_tenantId_idx" ON "Vaccine"("tenantId");
CREATE INDEX IF NOT EXISTS "Vaccine_tenantId_name_idx" ON "Vaccine"("tenantId", "name");

CREATE INDEX IF NOT EXISTS "VaccineEntry_tenantId_idx" ON "VaccineEntry"("tenantId");
CREATE INDEX IF NOT EXISTS "VaccineEntry_tenantId_vaccineId_idx" ON "VaccineEntry"("tenantId", "vaccineId");
CREATE INDEX IF NOT EXISTS "VaccineEntry_tenantId_expiresAt_idx" ON "VaccineEntry"("tenantId", "expiresAt");

CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_vaccineId_idx" ON "StockMovement"("tenantId", "vaccineId");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_birdLotId_idx" ON "StockMovement"("tenantId", "birdLotId");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_type_idx" ON "StockMovement"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_source_sourceId_idx" ON "StockMovement"("tenantId", "source", "sourceId");

CREATE INDEX IF NOT EXISTS "StockAlert_tenantId_idx" ON "StockAlert"("tenantId");
CREATE INDEX IF NOT EXISTS "StockAlert_tenantId_vaccineId_idx" ON "StockAlert"("tenantId", "vaccineId");

CREATE INDEX IF NOT EXISTS "VaccinationSchedule_tenantId_idx" ON "VaccinationSchedule"("tenantId");
CREATE INDEX IF NOT EXISTS "VaccinationSchedule_tenantId_status_idx" ON "VaccinationSchedule"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "VaccinationSchedule_tenantId_birdLotId_idx" ON "VaccinationSchedule"("tenantId", "birdLotId");
CREATE INDEX IF NOT EXISTS "VaccinationSchedule_tenantId_vaccinatorId_idx" ON "VaccinationSchedule"("tenantId", "vaccinatorId");

CREATE INDEX IF NOT EXISTS "VaccinationRequest_tenantId_idx" ON "VaccinationRequest"("tenantId");
CREATE INDEX IF NOT EXISTS "VaccinationRequest_tenantId_status_idx" ON "VaccinationRequest"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "VaccinationRequest_tenantId_scheduleId_idx" ON "VaccinationRequest"("tenantId", "scheduleId");
CREATE INDEX IF NOT EXISTS "VaccinationRequest_tenantId_vaccinatorId_idx" ON "VaccinationRequest"("tenantId", "vaccinatorId");

CREATE INDEX IF NOT EXISTS "CompletedVaccination_tenantId_idx" ON "CompletedVaccination"("tenantId");
CREATE INDEX IF NOT EXISTS "CompletedVaccination_tenantId_completedAt_idx" ON "CompletedVaccination"("tenantId", "completedAt");
CREATE INDEX IF NOT EXISTS "CompletedVaccination_tenantId_vaccinatorId_idx" ON "CompletedVaccination"("tenantId", "vaccinatorId");

CREATE INDEX IF NOT EXISTS "TemperaturePhoto_tenantId_idx" ON "TemperaturePhoto"("tenantId");
CREATE INDEX IF NOT EXISTS "TemperaturePhoto_tenantId_requestId_idx" ON "TemperaturePhoto"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "TemperaturePhoto_tenantId_completedVaccinationId_idx" ON "TemperaturePhoto"("tenantId", "completedVaccinationId");

CREATE INDEX IF NOT EXISTS "DoseRequest_tenantId_idx" ON "DoseRequest"("tenantId");
CREATE INDEX IF NOT EXISTS "DoseRequest_tenantId_status_idx" ON "DoseRequest"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DoseRequest_tenantId_requestId_idx" ON "DoseRequest"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "DoseRequest_tenantId_vaccinatorId_idx" ON "DoseRequest"("tenantId", "vaccinatorId");

CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_userId_idx" ON "Notification"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_vaccinatorId_idx" ON "Notification"("tenantId", "vaccinatorId");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_readAt_idx" ON "Notification"("tenantId", "readAt");

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_userId_idx" ON "AuditLog"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_tenantId_key" ON "Subscription"("tenantId");

CREATE INDEX IF NOT EXISTS "Payment_tenantId_idx" ON "Payment"("tenantId");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_idx" ON "Payment"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_subscriptionId_idx" ON "Payment"("tenantId", "subscriptionId");
CREATE INDEX IF NOT EXISTS "Payment_provider_providerPaymentId_idx" ON "Payment"("provider", "providerPaymentId");

CREATE INDEX IF NOT EXISTS "VaccinatorTenantLink_tenantId_idx" ON "VaccinatorTenantLink"("tenantId");
CREATE INDEX IF NOT EXISTS "VaccinatorTenantLink_tenantId_status_idx" ON "VaccinatorTenantLink"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "VaccinatorTenantLink_vaccinatorId_idx" ON "VaccinatorTenantLink"("vaccinatorId");
CREATE INDEX IF NOT EXISTS "VaccinatorTenantLink_vaccinatorEmail_idx" ON "VaccinatorTenantLink"("vaccinatorEmail");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FarmProfile_tenantId_fkey') THEN
    ALTER TABLE "FarmProfile" ADD CONSTRAINT "FarmProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vaccine_tenantId_fkey') THEN
    ALTER TABLE "Vaccine" ADD CONSTRAINT "Vaccine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccineEntry_tenantId_fkey') THEN
    ALTER TABLE "VaccineEntry" ADD CONSTRAINT "VaccineEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccineEntry_vaccineId_fkey') THEN
    ALTER TABLE "VaccineEntry" ADD CONSTRAINT "VaccineEntry_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "Vaccine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_tenantId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_vaccineId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "Vaccine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAlert_tenantId_fkey') THEN
    ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAlert_vaccineId_fkey') THEN
    ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "Vaccine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccinationSchedule_tenantId_fkey') THEN
    ALTER TABLE "VaccinationSchedule" ADD CONSTRAINT "VaccinationSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccinationRequest_tenantId_fkey') THEN
    ALTER TABLE "VaccinationRequest" ADD CONSTRAINT "VaccinationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompletedVaccination_tenantId_fkey') THEN
    ALTER TABLE "CompletedVaccination" ADD CONSTRAINT "CompletedVaccination_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TemperaturePhoto_tenantId_fkey') THEN
    ALTER TABLE "TemperaturePhoto" ADD CONSTRAINT "TemperaturePhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TemperaturePhoto_completedVaccinationId_fkey') THEN
    ALTER TABLE "TemperaturePhoto" ADD CONSTRAINT "TemperaturePhoto_completedVaccinationId_fkey" FOREIGN KEY ("completedVaccinationId") REFERENCES "CompletedVaccination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DoseRequest_tenantId_fkey') THEN
    ALTER TABLE "DoseRequest" ADD CONSTRAINT "DoseRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_tenantId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_tenantId_fkey') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_tenantId_fkey') THEN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_tenantId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_subscriptionId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccinatorTenantLink_tenantId_fkey') THEN
    ALTER TABLE "VaccinatorTenantLink" ADD CONSTRAINT "VaccinatorTenantLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VaccinatorTenantLink_vaccinatorId_fkey') THEN
    ALTER TABLE "VaccinatorTenantLink" ADD CONSTRAINT "VaccinatorTenantLink_vaccinatorId_fkey" FOREIGN KEY ("vaccinatorId") REFERENCES "Vaccinator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
