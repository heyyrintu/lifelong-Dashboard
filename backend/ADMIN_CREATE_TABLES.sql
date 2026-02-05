-- =====================================================
-- Complete Database Setup for Lifelong Dashboard
-- Run this as a database superuser/admin
-- =====================================================

-- First, grant permissions to the user
GRANT CREATE ON SCHEMA public TO adminLifelong;
GRANT ALL PRIVILEGES ON SCHEMA public TO adminLifelong;
GRANT ALL PRIVILEGES ON DATABASE "LIFELONG" TO adminLifelong;
ALTER ROLE adminLifelong CREATEDB;

-- Now create all tables

-- 1. Create ENUMs
CREATE TYPE "NormalizedCategory" AS ENUM ('E_COMMERCE', 'OFFLINE', 'QUICK_COMMERCE', 'EBO', 'B2C', 'OTHERS');
CREATE TYPE "ProductCategory" AS ENUM ('EDEL', 'HOME_AND_KITCHEN', 'ELECTRONICS', 'HEALTH_AND_PERSONAL_CARE', 'AUTOMOTIVE_AND_TOOLS', 'TOYS_AND_GAMES', 'BRAND_PRIVATE_LABEL', 'OTHERS');

-- 2. Create Outbound tables
CREATE TABLE "outbound_uploads" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "source" TEXT NOT NULL DEFAULT 'manual-upload',
    CONSTRAINT "outbound_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_rows" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "customer_group" TEXT,
    "source_warehouse" TEXT,
    "so_item" TEXT,
    "category_raw" TEXT,
    "sales_order_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_total_cbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_date" TIMESTAMP(3),
    "dispatch_by_date" TIMESTAMP(3),
    "delivery_note_date" TIMESTAMP(3),
    "delivery_note_item" TEXT,
    "delivery_note_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dn_total_cbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transporter" TEXT,
    "normalized_category" "NormalizedCategory" NOT NULL,
    "product_category" "ProductCategory" NOT NULL DEFAULT 'OTHERS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbound_rows_pkey" PRIMARY KEY ("id")
);

-- 3. Create Item Master table
CREATE TABLE "item_master" (
    "id" TEXT NOT NULL,
    "item_group" TEXT NOT NULL,
    "cbm_per_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_master_pkey" PRIMARY KEY ("id")
);

-- 4. Create Item Master Upload table
CREATE TABLE "item_master_uploads" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "rows_processed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "item_master_uploads_pkey" PRIMARY KEY ("id")
);

-- 5. Create Inbound tables
CREATE TABLE "inbound_uploads" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "source" TEXT NOT NULL DEFAULT 'manual-upload',
    CONSTRAINT "inbound_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_rows" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "sr_no" TEXT,
    "date_of_unload" TIMESTAMP(3),
    "invoice_sku" TEXT,
    "received_sku" TEXT,
    "invoice_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "received_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "good_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_group" TEXT,
    "cbm_per_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_cbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "product_category" "ProductCategory" NOT NULL DEFAULT 'OTHERS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbound_rows_pkey" PRIMARY KEY ("id")
);

-- 6. Create Inventory tables
CREATE TABLE "inventory_uploads" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "source" TEXT NOT NULL DEFAULT 'manual-upload',
    CONSTRAINT "inventory_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_rows" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "item_group" TEXT NOT NULL,
    "cbm_per_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_total_row" BOOLEAN NOT NULL DEFAULT false,
    "product_category" "ProductCategory" NOT NULL DEFAULT 'OTHERS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_rows_pkey" PRIMARY KEY ("id")
);

-- 7. Create Billing tables
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_lines" (
    "id" TEXT NOT NULL,
    "billing_period_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "line_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_lines_pkey" PRIMARY KEY ("id")
);

-- 8. Create Attendance tables
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employee_code" TEXT,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- 9. Add Foreign Keys
ALTER TABLE "outbound_rows" ADD CONSTRAINT "outbound_rows_upload_id_fkey" 
    FOREIGN KEY ("upload_id") REFERENCES "outbound_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbound_rows" ADD CONSTRAINT "inbound_rows_upload_id_fkey" 
    FOREIGN KEY ("upload_id") REFERENCES "inbound_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_rows" ADD CONSTRAINT "inventory_rows_upload_id_fkey" 
    FOREIGN KEY ("upload_id") REFERENCES "inventory_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_lines" ADD CONSTRAINT "billing_lines_billing_period_id_fkey" 
    FOREIGN KEY ("billing_period_id") REFERENCES "billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" 
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. Create Indexes for Performance
CREATE INDEX "outbound_rows_upload_id_idx" ON "outbound_rows"("upload_id");
CREATE INDEX "outbound_rows_delivery_note_date_idx" ON "outbound_rows"("delivery_note_date");
CREATE INDEX "outbound_rows_so_date_idx" ON "outbound_rows"("so_date");
CREATE INDEX "outbound_rows_dispatch_by_date_idx" ON "outbound_rows"("dispatch_by_date");
CREATE INDEX "outbound_rows_normalized_category_idx" ON "outbound_rows"("normalized_category");
CREATE INDEX "outbound_rows_product_category_idx" ON "outbound_rows"("product_category");
CREATE INDEX "outbound_rows_upload_id_delivery_note_date_idx" ON "outbound_rows"("upload_id", "delivery_note_date");
CREATE INDEX "outbound_rows_upload_id_so_date_idx" ON "outbound_rows"("upload_id", "so_date");
CREATE INDEX "outbound_rows_upload_id_normalized_category_idx" ON "outbound_rows"("upload_id", "normalized_category");

CREATE INDEX "inbound_rows_upload_id_idx" ON "inbound_rows"("upload_id");
CREATE INDEX "inbound_rows_date_of_unload_idx" ON "inbound_rows"("date_of_unload");
CREATE INDEX "inbound_rows_received_sku_idx" ON "inbound_rows"("received_sku");
CREATE INDEX "inbound_rows_upload_id_date_of_unload_idx" ON "inbound_rows"("upload_id", "date_of_unload");
CREATE INDEX "inbound_rows_product_category_idx" ON "inbound_rows"("product_category");

CREATE INDEX "inventory_rows_upload_id_idx" ON "inventory_rows"("upload_id");
CREATE INDEX "inventory_rows_warehouse_idx" ON "inventory_rows"("warehouse");
CREATE INDEX "inventory_rows_item_group_idx" ON "inventory_rows"("item_group");
CREATE INDEX "inventory_rows_product_category_idx" ON "inventory_rows"("product_category");

CREATE UNIQUE INDEX "billing_periods_month_year_key" ON "billing_periods"("month", "year");
CREATE INDEX "billing_lines_billing_period_id_idx" ON "billing_lines"("billing_period_id");

CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");
CREATE INDEX "attendance_records_employee_id_idx" ON "attendance_records"("employee_id");
CREATE INDEX "attendance_records_date_idx" ON "attendance_records"("date");
CREATE UNIQUE INDEX "attendance_records_employee_id_date_key" ON "attendance_records"("employee_id", "date");

-- 11. Create _prisma_migrations table for tracking
CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

-- Done!
SELECT 'All tables created successfully!' AS result;
