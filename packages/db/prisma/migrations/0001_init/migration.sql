-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'employee');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'onboarding', 'paused', 'churned');

-- CreateEnum
CREATE TYPE "ServiceBillingMode" AS ENUM ('monthly', 'one_time', 'per_production', 'per_hour');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('pending', 'collected', 'partial', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('no_invoice', 'pending', 'invoiced', 'sent', 'error_arca', 'manual', 'not_required');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'paid', 'partial', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('collaborator', 'provider', 'employee', 'fixed_expense', 'monotributo', 'platform');

-- CreateEnum
CREATE TYPE "MonthStatus" AS ENUM ('draft', 'review', 'closed', 'reopened');

-- CreateEnum
CREATE TYPE "TreasuryPartner" AS ENUM ('vicky', 'flor', 'more', 'shared');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('charge', 'collection', 'generated', 'payment', 'adjustment', 'reversal');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "defaultCurrency" "Currency" NOT NULL DEFAULT 'ARS',
    "fiscalLegalName" TEXT,
    "fiscalTaxId" TEXT,
    "monotributoCategory" TEXT,
    "positionAsOf" TIMESTAMP(3),
    "monthlyRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceRole" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60),
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "grants" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'employee',
    "roleId" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notificationPrefs" JSONB,
    "teamMemberId" UUID,
    "payoutBankId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "employmentType" TEXT NOT NULL DEFAULT 'collaborator',
    "startDate" TIMESTAMP(3),
    "compensationModel" TEXT NOT NULL DEFAULT 'monthly_fixed',
    "hourlyRateMinor" BIGINT,
    "monthlyAmountMinor" BIGINT,
    "productionRateMinor" BIGINT,
    "capacityHoursMonthly" DOUBLE PRECISION,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "bankId" UUID,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" UUID NOT NULL,
    "bankName" TEXT,
    "accountHolder" TEXT,
    "cbuOrCvu" TEXT,
    "alias" TEXT,
    "accountType" TEXT,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientService" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "serviceId" UUID,
    "name" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "billingMode" "ServiceBillingMode" NOT NULL DEFAULT 'monthly',
    "includedHours" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableLine" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "clientServiceId" UUID,
    "name" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "originalAmountMinor" BIGINT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "taxId" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'onboarding',
    "monthlyFeeMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "billingEntityId" TEXT,
    "startDate" TIMESTAMP(3),
    "lastIncreaseDate" TIMESTAMP(3),
    "clientType" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentMethod" TEXT,
    "discountPercentBp" INTEGER,
    "projectFeeMinor" BIGINT,
    "projectEndDate" TIMESTAMP(3),
    "billingCycle" TEXT,
    "contactName" TEXT,
    "billingEmail" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "secondaryEmail" TEXT,
    "adminContactName" TEXT,
    "adminContactEmail" TEXT,
    "adminContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAssignment" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "serviceId" UUID,
    "roleOnClient" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "assignedSince" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "allocationPercent" INTEGER,
    "estimatedMonthlyHours" INTEGER,
    "monthlyCostMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEmitter" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cuit" TEXT,
    "puntoDeVenta" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "monthlyLimitMinor" BIGINT,
    "annualLimitMinor" BIGINT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEmitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "service" TEXT NOT NULL,
    "baseAmountMinor" BIGINT NOT NULL,
    "extraAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "discountAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "totalAmountMinor" BIGINT NOT NULL,
    "collectedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "costDesignMinor" BIGINT NOT NULL DEFAULT 0,
    "costCommMinor" BIGINT NOT NULL DEFAULT 0,
    "costProductionMinor" BIGINT NOT NULL DEFAULT 0,
    "costViaticsMinor" BIGINT NOT NULL DEFAULT 0,
    "costPautaMinor" BIGINT NOT NULL DEFAULT 0,
    "costFixedMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "originalCurrency" "Currency",
    "originalAmountMinor" BIGINT,
    "fxRateMinor" BIGINT,
    "dueDate" DATE NOT NULL,
    "collectedAt" TIMESTAMP(3),
    "treasuryAccountId" UUID,
    "status" "CollectionStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'no_invoice',
    "emitterId" UUID,
    "invoiceNumber" TEXT,
    "cae" TEXT,
    "invoiceIssuedAt" TIMESTAMP(3),
    "reviewStatus" TEXT,
    "effectiveDate" DATE,
    "planNotes" TEXT,
    "extras" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyExchangeRate" (
    "id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "arsPerUsdMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "bankId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "recipientType" "RecipientType" NOT NULL,
    "teamMemberId" UUID,
    "providerId" UUID,
    "recipientName" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "paidAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "expectedDate" DATE NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "treasuryAccountId" UUID,
    "invoiceEmitterId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutStatement" (
    "id" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "baseAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "productionsAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "viaticsAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "adjustmentsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "totalAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "paidAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "hoursTotal" DOUBLE PRECISION,
    "hourlyRateMinor" BIGINT,
    "statementStatus" TEXT NOT NULL DEFAULT 'draft',
    "bankId" UUID,
    "bankProfile" JSONB,
    "dueDate" DATE,
    "paidAt" DATE,
    "treasuryAccountId" UUID,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAdjustment" (
    "id" UUID NOT NULL,
    "payoutStatementId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthRecord" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "MonthStatus" NOT NULL DEFAULT 'draft',
    "checklist" JSONB,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthSnapshot" (
    "id" UUID NOT NULL,
    "monthRecordId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "bakedActuals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,

    CONSTRAINT "MonthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Production" (
    "id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "date" DATE NOT NULL,
    "clientId" UUID,
    "clientName" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "responsible" TEXT,
    "participants" JSONB,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viaticsMinor" BIGINT NOT NULL DEFAULT 0,
    "totalCostMinor" BIGINT NOT NULL DEFAULT 0,
    "billable" TEXT,
    "billAmountMinor" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "clientServiceId" UUID,
    "receivableId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "accountManagerId" UUID,
    "viaticsPaidAt" DATE,
    "receipt" TEXT,
    "packHours" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionParticipant" (
    "id" UUID NOT NULL,
    "productionId" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "hours" DOUBLE PRECISION,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "clientId" UUID,
    "clientName" TEXT,
    "taskType" TEXT NOT NULL DEFAULT 'general',
    "date" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isOutOfScope" BOOLEAN NOT NULL DEFAULT false,
    "loggedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberExpense" (
    "id" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "clientId" UUID,
    "clientName" TEXT,
    "date" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "loggedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MemberExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberExtraWork" (
    "id" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "clientId" UUID,
    "clientName" TEXT,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "hours" DOUBLE PRECISION,
    "amountMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedByUserId" UUID,
    "loggedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MemberExtraWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'monthly',
    "responsible" TEXT,
    "monotributo" TEXT,
    "payStatus" TEXT NOT NULL DEFAULT 'pending',
    "affectsProfitability" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAlert" (
    "id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryAccount" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "partner" "TreasuryPartner" NOT NULL DEFAULT 'shared',
    "type" TEXT NOT NULL DEFAULT 'bank',
    "balanceArsMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceUsdMinor" BIGINT NOT NULL DEFAULT 0,
    "isReserve" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryMovement" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "direction" TEXT NOT NULL,
    "lane" TEXT NOT NULL DEFAULT 'ARS',
    "amountMinor" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,

    CONSTRAINT "TreasuryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommittedItem" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "category" TEXT,
    "recurrence" TEXT NOT NULL DEFAULT 'one_time',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "anchorDay" INTEGER NOT NULL DEFAULT 1,
    "confidence" TEXT NOT NULL DEFAULT 'expected',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "linkedEntityType" TEXT,
    "linkedEntityId" UUID,
    "observations" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CommittedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "invoiceNumber" TEXT,
    "description" TEXT NOT NULL,
    "debitMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceMinor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "reversesEntryId" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRole_name_key" ON "WorkspaceRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRole_key_key" ON "WorkspaceRole"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_teamMemberId_key" ON "User"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_userId_idx" ON "Invitation"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_createdAt_idx" ON "TeamMember"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE INDEX "ClientService_clientId_idx" ON "ClientService"("clientId");

-- CreateIndex
CREATE INDEX "ClientService_serviceId_idx" ON "ClientService"("serviceId");

-- CreateIndex
CREATE INDEX "ReceivableLine_receivableId_idx" ON "ReceivableLine"("receivableId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_createdAt_idx" ON "Client"("createdAt");

-- CreateIndex
CREATE INDEX "ClientAssignment_clientId_teamMemberId_idx" ON "ClientAssignment"("clientId", "teamMemberId");

-- CreateIndex
CREATE INDEX "ClientAssignment_clientId_status_idx" ON "ClientAssignment"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientAssignment_teamMemberId_status_idx" ON "ClientAssignment"("teamMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceEmitter_code_key" ON "InvoiceEmitter"("code");

-- CreateIndex
CREATE INDEX "Receivable_period_idx" ON "Receivable"("period");

-- CreateIndex
CREATE INDEX "Receivable_clientId_period_idx" ON "Receivable"("clientId", "period");

-- CreateIndex
CREATE INDEX "Receivable_period_status_idx" ON "Receivable"("period", "status");

-- CreateIndex
CREATE INDEX "Receivable_emitterId_invoiceIssuedAt_idx" ON "Receivable"("emitterId", "invoiceIssuedAt");

-- CreateIndex
CREATE INDEX "Receivable_createdAt_idx" ON "Receivable"("createdAt");

-- CreateIndex
CREATE INDEX "Receivable_treasuryAccountId_idx" ON "Receivable"("treasuryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_invoiceNumber_key" ON "Receivable"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyExchangeRate_period_key" ON "MonthlyExchangeRate"("period");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE INDEX "Payment_period_idx" ON "Payment"("period");

-- CreateIndex
CREATE INDEX "Payment_teamMemberId_period_idx" ON "Payment"("teamMemberId", "period");

-- CreateIndex
CREATE INDEX "Payment_providerId_period_idx" ON "Payment"("providerId", "period");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_treasuryAccountId_idx" ON "Payment"("treasuryAccountId");

-- CreateIndex
CREATE INDEX "Payment_invoiceEmitterId_idx" ON "Payment"("invoiceEmitterId");

-- CreateIndex
CREATE INDEX "PayoutStatement_createdAt_idx" ON "PayoutStatement"("createdAt");

-- CreateIndex
CREATE INDEX "PayoutStatement_treasuryAccountId_idx" ON "PayoutStatement"("treasuryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutStatement_teamMemberId_period_key" ON "PayoutStatement"("teamMemberId", "period");

-- CreateIndex
CREATE INDEX "TeamAdjustment_payoutStatementId_idx" ON "TeamAdjustment"("payoutStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthRecord_period_key" ON "MonthRecord"("period");

-- CreateIndex
CREATE UNIQUE INDEX "MonthSnapshot_monthRecordId_version_key" ON "MonthSnapshot"("monthRecordId", "version");

-- CreateIndex
CREATE INDEX "Production_period_idx" ON "Production"("period");

-- CreateIndex
CREATE INDEX "Production_clientId_period_idx" ON "Production"("clientId", "period");

-- CreateIndex
CREATE INDEX "Production_clientServiceId_idx" ON "Production"("clientServiceId");

-- CreateIndex
CREATE INDEX "Production_receivableId_idx" ON "Production"("receivableId");

-- CreateIndex
CREATE INDEX "ProductionParticipant_teamMemberId_idx" ON "ProductionParticipant"("teamMemberId");

-- CreateIndex
CREATE INDEX "ProductionParticipant_productionId_idx" ON "ProductionParticipant"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionParticipant_productionId_teamMemberId_key" ON "ProductionParticipant"("productionId", "teamMemberId");

-- CreateIndex
CREATE INDEX "TimeEntry_teamMemberId_idx" ON "TimeEntry"("teamMemberId");

-- CreateIndex
CREATE INDEX "TimeEntry_date_idx" ON "TimeEntry"("date");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "MemberExpense_teamMemberId_idx" ON "MemberExpense"("teamMemberId");

-- CreateIndex
CREATE INDEX "MemberExpense_date_idx" ON "MemberExpense"("date");

-- CreateIndex
CREATE INDEX "MemberExtraWork_teamMemberId_idx" ON "MemberExtraWork"("teamMemberId");

-- CreateIndex
CREATE INDEX "MemberExtraWork_date_idx" ON "MemberExtraWork"("date");

-- CreateIndex
CREATE INDEX "FixedExpense_period_idx" ON "FixedExpense"("period");

-- CreateIndex
CREATE INDEX "MonthlyAlert_period_idx" ON "MonthlyAlert"("period");

-- CreateIndex
CREATE INDEX "TreasuryAccount_isActive_idx" ON "TreasuryAccount"("isActive");

-- CreateIndex
CREATE INDEX "TreasuryMovement_accountId_date_idx" ON "TreasuryMovement"("accountId", "date");

-- CreateIndex
CREATE INDEX "TreasuryMovement_referenceType_referenceId_idx" ON "TreasuryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "CommittedItem_isActive_idx" ON "CommittedItem"("isActive");

-- CreateIndex
CREATE INDEX "CommittedItem_linkedEntityType_linkedEntityId_idx" ON "CommittedItem"("linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE INDEX "LedgerEntry_entityType_entityId_seq_idx" ON "LedgerEntry"("entityType", "entityId", "seq");

-- CreateIndex
CREATE INDEX "LedgerEntry_entityType_entityId_currency_seq_idx" ON "LedgerEntry"("entityType", "entityId", "currency", "seq");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableLine" ADD CONSTRAINT "ReceivableLine_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableLine" ADD CONSTRAINT "ReceivableLine_clientServiceId_fkey" FOREIGN KEY ("clientServiceId") REFERENCES "ClientService"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_emitterId_fkey" FOREIGN KEY ("emitterId") REFERENCES "InvoiceEmitter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceEmitterId_fkey" FOREIGN KEY ("invoiceEmitterId") REFERENCES "InvoiceEmitter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutStatement" ADD CONSTRAINT "PayoutStatement_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutStatement" ADD CONSTRAINT "PayoutStatement_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAdjustment" ADD CONSTRAINT "TeamAdjustment_payoutStatementId_fkey" FOREIGN KEY ("payoutStatementId") REFERENCES "PayoutStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthSnapshot" ADD CONSTRAINT "MonthSnapshot_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "MonthRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_clientServiceId_fkey" FOREIGN KEY ("clientServiceId") REFERENCES "ClientService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionParticipant" ADD CONSTRAINT "ProductionParticipant_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionParticipant" ADD CONSTRAINT "ProductionParticipant_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma's DSL cannot express. The schema documents each one where it lives.

-- At most one live assignment per (client, member); ended history is unlimited.
CREATE UNIQUE INDEX "ClientAssignment_live_pair_key"
  ON "ClientAssignment" ("clientId", "teamMemberId")
  WHERE "status" <> 'ended';

-- One live service line per (client, name), so a removed service can be re-contracted.
CREATE UNIQUE INDEX "ClientService_live_name_key"
  ON "ClientService" ("clientId", "name")
  WHERE "deletedAt" IS NULL;

-- One monthly-fee receivable per (client, period).
CREATE UNIQUE INDEX "Receivable_monthly_fee_client_period_key"
  ON "Receivable" ("clientId", "period")
  WHERE "source" = 'monthly_fee' AND "deletedAt" IS NULL;

ALTER TABLE "Client" ADD CONSTRAINT "Client_discountPercentBp_range"
  CHECK ("discountPercentBp" IS NULL OR ("discountPercentBp" >= 0 AND "discountPercentBp" <= 10000));

ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_monthlyCostMinor_nonneg"
  CHECK ("monthlyCostMinor" IS NULL OR "monthlyCostMinor" >= 0);

ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_priceMinor_nonneg"
  CHECK ("priceMinor" >= 0);

ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_lane_check"
  CHECK ("lane" IN ('ARS', 'USD'));

-- Database-side id defaults, so raw-SQL inserts may omit the id.
ALTER TABLE "FixedExpense"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "MemberExpense"         ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "MemberExtraWork"       ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "MonthlyAlert"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "MonthlyExchangeRate"   ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Notification"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Production"            ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ProductionParticipant" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "TimeEntry"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "TreasuryMovement"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
