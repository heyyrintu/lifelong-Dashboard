-- ============================================
-- Manual Migration: Create item_master table
-- ============================================
-- Run this SQL script if automatic migrations fail due to permission issues
-- This script is based on the Prisma schema

-- Create item_master table if it doesn't exist
CREATE TABLE IF NOT EXISTS "item_master" (
    "id" TEXT NOT NULL,
    "item_group" TEXT NOT NULL,
    "cbm_per_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_master_pkey" PRIMARY KEY ("id")
);

-- Verify the table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'item_master' 
ORDER BY ordinal_position;
