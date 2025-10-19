-- Create NotificationType enum
CREATE TYPE "NotificationType" AS ENUM (
  'NEW_CONTACT_CREATED',
  'NEW_EMAIL_PROCESSED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'CALENDAR_EVENT_CREATED',
  'HUBSPOT_TOKEN_EXPIRED',
  'GOOGLE_TOKEN_EXPIRED',
  'PROACTIVE_ACTION',
  'ERROR'
);

-- Create NotificationSeverity enum
CREATE TYPE "NotificationSeverity" AS ENUM (
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR'
);

-- Create Notification table
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- Generate default cuid function if not exists (for id generation)
CREATE OR REPLACE FUNCTION generate_cuid() RETURNS TEXT AS $$
BEGIN
  RETURN 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
END;
$$ LANGUAGE plpgsql;

