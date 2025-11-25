# Phase 3 - Inbound with CBM Setup Instructions

## Overview
Phase 3 adds Inbound functionality with CBM (Cubic Meter) calculations by joining inbound data with Item Master information.

## New Features Added

### Backend Changes
- **Database Schema**: Added `ItemMaster`, `InboundUpload`, and `InboundRow` tables
- **New Endpoints**:
  - `POST /inbound/item-master/upload` - Upload Item Master Excel file
  - `POST /inbound/upload` - Upload Inbound Fresh Receipt Excel file
  - `GET /inbound/summary` - Get inbound metrics with date filtering
- **CBM Calculation**: Automatic CBM calculation by joining received SKUs with Item Master data

### Frontend Changes
- **Upload Page**: Added support for Item Master and Inbound file uploads
- **Inbound Page**: Real API integration with 6 metric cards and date filtering
- **6 Inbound Cards**:
  1. Invoice SKU Count
  2. Received SKU Count  
  3. Invoice Qty
  4. Received Qty
  5. Good Qty
  6. Total CBM

## Database Setup Required

### 1. Start PostgreSQL Database
```bash
# From project root directory
docker-compose up -d postgres
```

### 2. Run Database Migrations
```bash
# Navigate to backend directory
cd backend

# Generate and apply migrations
npx prisma migrate dev --name add-inbound-item-master
```

### 3. Verify Database Connection
The database should be accessible at `172.21.0.2:5432` as configured in the `.env` file.

## Excel File Formats

### Item Master Excel Format
- **File**: Item master.xlsx (or similar)
- **Headers**: Row 1 contains headers
- **Data**: Starts from row 2
- **Columns**:
  - ID: Column B (primary key)
  - Item Group: Column D
  - CBM: Column H (CBM per unit)

### Inbound Excel Format (Fresh Receipt)
- **File**: MIS_25-11-2025 Updated.xlsx (or similar)
- **Headers**: Row 1 is blank, Row 2 contains headers
- **Data**: Starts from row 3
- **Columns**:
  - Date of Unload: Column B
  - Invoice SKU: Column I
  - Received SKU: Column J
  - Invoice Qty: Column K
  - Received Qty: Column L
  - Good: Column N

## Usage Workflow

### 1. Upload Item Master
1. Go to `/upload` page
2. Select "Item Master File" as file type
3. Upload your Item Master Excel file
4. Success message shows rows processed

### 2. Upload Inbound Data
1. Go to `/upload` page
2. Select "Inbound File" as file type
3. Upload your Fresh Receipt Excel file
4. System automatically joins with Item Master to calculate CBM
5. Success message shows rows inserted

### 3. View Inbound Dashboard
1. Go to `/inbound` page
2. View 6 metric cards with real data
3. Use date filters to filter by Date of Unload
4. CBM values are automatically calculated from Item Master

## API Endpoints

### Item Master Upload
```
POST /inbound/item-master/upload
Content-Type: multipart/form-data
Body: file (Excel file)
Response: { "rowsProcessed": 1234 }
```

### Inbound Upload
```
POST /inbound/upload
Content-Type: multipart/form-data
Body: file (Excel file)
Response: { "uploadId": "uuid", "rowsInserted": 4567 }
```

### Inbound Summary
```
GET /inbound/summary?fromDate=2025-01-01&toDate=2025-01-31
Response: {
  "cards": {
    "invoiceSkuCount": 123,
    "receivedSkuCount": 120,
    "invoiceQtyTotal": 12345.67,
    "receivedQtyTotal": 12000.50,
    "goodQtyTotal": 11950.00,
    "totalCbm": 1234.56
  },
  "availableDates": {
    "minDate": "2025-01-01",
    "maxDate": "2025-01-31"
  }
}
```

## CBM Calculation Logic

The system calculates CBM for each inbound row by:
1. Using the `received_sku` field to match with `ItemMaster.id`
2. If found: uses `ItemMaster.cbm_per_unit` and `item_group`
3. If not found: defaults to CBM = 0 and item_group = "Others"
4. Total CBM = `received_qty` × `cbm_per_unit`

## Error Handling

- Invalid Excel files return proper error messages
- Missing/invalid numeric values default to 0
- Invalid dates default to null
- Missing Item Master entries default to CBM = 0 and "Others" group
- Database errors are logged and return user-friendly messages

## Testing the Implementation

1. Start the database: `docker-compose up -d postgres`
2. Run migrations: `cd backend && npx prisma migrate dev`
3. Start backend: `npm run start:dev`
4. Start frontend: `npm run dev`
5. Upload Item Master file first
6. Upload Inbound file second
7. Check `/inbound` page for metrics

## Troubleshooting

### Database Connection Issues
- Ensure Docker is running
- Start PostgreSQL: `docker-compose up -d postgres`
- Check .env file for correct DATABASE_URL
- Verify database is accessible at configured host/port

### Migration Issues
- Database must be running before migrations
- Check Prisma schema syntax
- Clear Prisma cache: `npx prisma generate`

### Upload Issues
- Verify Excel file format matches requirements
- Check file size limits (default: 10MB)
- Ensure correct file type selection on upload page
- Check browser console for JavaScript errors

## Next Steps

After Phase 3 is complete:
- Consider adding inbound data tables/views
- Add item group filtering
- Implement inventory impact calculations
- Add vendor/supplier analysis features
