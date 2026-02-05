# Database Permission Issue - Action Required

## Problem
The database user `adminLifelong` does **not** have `CREATE` permission on the schema `public`. This prevents:
- Running Prisma migrations
- Creating new tables
- The backend application from starting properly

## Error Message
```
ERROR: permission denied for schema public
```

## Solution Options

### Option 1: Grant Permissions (Recommended)
Contact your database administrator to run these SQL commands:

```sql
GRANT CREATE ON SCHEMA public TO adminLifelong;
GRANT ALL PRIVILEGES ON SCHEMA public TO adminLifelong;
GRANT ALL PRIVILEGES ON DATABASE "LIFELONG" TO adminLifelong;
ALTER ROLE adminLifelong CREATEDB;
```

After permissions are granted, run:
```bash
cd backend
npx prisma migrate deploy
npm run start:dev
```

### Option 2: Manual Table Creation
If you cannot get permissions, have the admin run the complete SQL script:
- File: `backend/ADMIN_CREATE_TABLES.sql`

This will create all tables manually.

### Option 3: Use a Different Database User
Get credentials for a superuser or user with CREATE privileges, then update `backend/.env`:

```env
DATABASE_URL="postgresql://SUPERUSER:PASSWORD@dronadatabase-do-user-32480697-0.f.db.ondigitalocean.com:25061/LIFELONG?sslmode=require"
```

## Current Database Configuration
- **Host**: `dronadatabase-do-user-32480697-0.f.db.ondigitalocean.com`
- **Port**: `25061`
- **Database**: `LIFELONG`
- **User**: `adminLifelong` (limited permissions)
- **Issue**: User cannot create tables

## What Tables Are Needed?
The application requires these tables:
- `item_master` - Product master data
- `item_master_uploads` - Upload tracking
- `inbound_uploads` / `inbound_rows` - Inbound data
- `outbound_uploads` / `outbound_rows` - Outbound data
- `inventory_uploads` / `inventory_rows` - Inventory data
- `billing_periods` / `billing_lines` - Billing data
- `employees` / `attendance_records` - Attendance data
- `_prisma_migrations` - Migration tracking

## Need Help?
Contact your DigitalOcean database administrator or the person who created the database connection.
