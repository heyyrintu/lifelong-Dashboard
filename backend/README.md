# Lifelong Dashboard - Backend

NestJS backend service for the Lifelong Dashboard application.

## Features

- **Outbound Management**: Upload Excel files and query outbound data with aggregations
- **PostgreSQL Database**: Persistent storage with Prisma ORM
- **RESTful API**: JSON-based API endpoints
- **Category Normalization**: Automatic customer group categorization

## Tech Stack

- NestJS (TypeScript)
- Prisma ORM
- PostgreSQL
- xlsx (Excel parsing)
- Multer (File uploads)

## Prerequisites

- Node.js 18+ 
- PostgreSQL 15+ (or use Docker Compose)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Set Up Database

**Option A: Using Docker (Recommended)**

From the project root directory:

```bash
docker-compose up -d
```

This will start a PostgreSQL container on port 5432.

**Option B: Local PostgreSQL**

Install PostgreSQL locally and create a database named `lifelong_dashboard`.

### 3. Configure Environment

Create a `.env` file in the `backend` directory:

```bash
cp .env.example .env
```

Edit `.env` if needed (default values work with Docker):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lifelong_dashboard?schema=public"
PORT=3001
```

### 4. Run Prisma Migrations

Generate Prisma Client and create database tables:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Start the Backend Server

**Development mode (with hot reload):**

```bash
npm run start:dev
```

**Production mode:**

```bash
npm run build
npm run start:prod
```

The backend will run on `http://localhost:3001`.

## API Endpoints

### Upload Outbound Excel

**POST** `/outbound/upload`

Upload an Excel file with outbound data.

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `file`
- File format: `.xlsx` or `.xls`

**Excel Column Mapping:**
- Column C → Customer Group
- Column K → Source Warehouse
- Column L → SO Item
- Column M → Category (raw)
- Column N → Sales Order Qty
- Column P → SO Total CBM
- Column S → Delivery Note Date
- Column U → Delivery Note Item
- Column V → Delivery Note Qty
- Column W → DN Total CBM
- Column X → Transporter

**Response:**
```json
{
  "uploadId": "uuid",
  "rowsInserted": 1234
}
```

### Get Outbound Summary

**GET** `/outbound/summary`

Retrieve aggregated outbound data with optional filters.

**Query Parameters:**
- `uploadId` (optional) - Specific upload ID. Defaults to latest.
- `fromDate` (optional) - ISO date string (e.g., `2025-01-01`)
- `toDate` (optional) - ISO date string
- `month` (optional) - Month filter (e.g., `2025-01` or `ALL`)

**Response:**
```json
{
  "cards": {
    "soSku": 150,
    "soQty": 5000,
    "soTotalCbm": 250.5,
    "dnSku": 140,
    "dnQty": 4800,
    "dnTotalCbm": 245.2,
    "soMinusDnQty": 200
  },
  "categoryTable": [
    {
      "categoryLabel": "E-Commerce",
      "soCount": 50,
      "soQty": 1500,
      "soTotalCbm": 75.5,
      "dnCount": 48,
      "dnQty": 1450,
      "dnTotalCbm": 72.1,
      "soMinusDnQty": 50
    }
    // ... more categories
  ],
  "availableMonths": ["ALL", "2025-01", "2025-02"]
}
```

## Category Normalization Rules

Customer groups are automatically classified into these categories:

- **B2C**: decathlon, flipkart(b2c), snapmint, shopify, tatacliq, amazon b2c, pepperfry
- **E_COMMERCE**: amazon, flipkart (generic e-commerce)
- **QUICK_COMMERCE**: blinkit, swiggy, bigbasket, zepto
- **OFFLINE**: offline sales-b2b, offline – gt, offline - mt
- **EBO**: store locations (e.g., store 2-lucknow, store3-zirakpur)
- **OTHERS**: Fallback for unmatched groups

## Database Schema

### outbound_uploads
- `id` - UUID primary key
- `file_name` - Original filename
- `uploaded_at` - Upload timestamp
- `status` - Processing status (processed/failed)
- `source` - Upload source (default: manual-upload)

### outbound_rows
- `id` - UUID primary key
- `upload_id` - Foreign key to outbound_uploads
- `customer_group` - Customer group string
- `source_warehouse` - Warehouse identifier
- `so_item` - Sales order item code
- `category_raw` - Raw category from Excel
- `sales_order_qty` - SO quantity (numeric)
- `so_total_cbm` - SO volume (numeric)
- `delivery_note_date` - DN date
- `delivery_note_item` - DN item code
- `delivery_note_qty` - DN quantity (numeric)
- `dn_total_cbm` - DN volume (numeric)
- `transporter` - Transporter name
- `normalized_category` - Enum (E_COMMERCE, OFFLINE, etc.)
- `created_at` - Record creation timestamp

Indices on: `upload_id`, `delivery_note_date`, `normalized_category`

## Prisma Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Create and apply migrations
npm run prisma:migrate

# Open Prisma Studio (DB GUI)
npm run prisma:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## Development Notes

- In-memory caching is currently used for summary queries
- TODO: Migrate cache to Redis for production
- Uploaded files are temporarily stored in `./uploads` and deleted after processing
- File size limit: 10MB

## Future Enhancements

- Redis caching layer
- Additional domains: Inbound, Inventory, Billing
- Batch upload processing with queue
- Excel export endpoints
- Advanced filtering and search
