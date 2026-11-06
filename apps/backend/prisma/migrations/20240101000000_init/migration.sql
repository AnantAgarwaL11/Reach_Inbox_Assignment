-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "minimumSendDelay" INTEGER NOT NULL DEFAULT 2000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "idempotencyKey" TEXT NOT NULL,
    "queueJobId" TEXT,
    "errorMessage" TEXT,
    "previewUrl" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_googleId_idx" ON "users"("googleId");

CREATE INDEX "senders_userId_idx" ON "senders"("userId");
CREATE UNIQUE INDEX "senders_userId_email_key" ON "senders"("userId", "email");

CREATE UNIQUE INDEX "emails_idempotencyKey_key" ON "emails"("idempotencyKey");
CREATE INDEX "emails_userId_idx" ON "emails"("userId");
CREATE INDEX "emails_senderId_idx" ON "emails"("senderId");
CREATE INDEX "emails_status_idx" ON "emails"("status");
CREATE INDEX "emails_scheduledAt_idx" ON "emails"("scheduledAt");
CREATE INDEX "emails_idempotencyKey_idx" ON "emails"("idempotencyKey");

CREATE UNIQUE INDEX "slack_integrations_userId_key" ON "slack_integrations"("userId");
CREATE INDEX "slack_integrations_userId_idx" ON "slack_integrations"("userId");

-- AddForeignKey
ALTER TABLE "senders" ADD CONSTRAINT "senders_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emails" ADD CONSTRAINT "emails_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emails" ADD CONSTRAINT "emails_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
