-- Add refresh_token_expires_in column to Account table
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refresh_token_expires_in" INTEGER;

