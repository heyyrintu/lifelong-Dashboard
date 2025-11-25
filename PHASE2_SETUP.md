# Phase 2 Setup Guide - Outbound with Real Backend

This guide walks you through setting up the complete Phase 2 implementation with a real backend, database, and end-to-end data flow.

## 🎯 What's New in Phase 2

✅ **NestJS Backend** - Full TypeScript backend with REST API  
✅ **PostgreSQL Database** - Real data persistence with Prisma ORM  
✅ **Excel Upload & Parsing** - Upload outbound Excel files and parse into database  
✅ **Real-time Data** - Outbound page fetches live data from backend  
✅ **Category Normalization** - Automatic customer group classification  
✅ **Date Filtering** - Filter data by date range or month  
✅ **No Mock Data** - All placeholder data removed

## 📋 Prerequisites

Before starting, ensure you have:

- **Node.js** 18 or higher
- **Docker Desktop** (recommended) OR local PostgreSQL 15+
- **Git** (for cloning)

## 🚀 Quick Start (Recommended Path)

### Step 1: Install Dependencies

**Frontend:**
```bash
# From project root
npm install
```

**Backend:**
```bash
cd backend
npm install
```

### Step 2: Start PostgreSQL Database

**Using Docker Compose (Easiest):**
```bash
# From project root
docker-compose up -d
```

This starts PostgreSQL on `localhost:5432` with:
- Database: `lifelong_dashboard`
- User: `postgres`
- Password: `postgres`

**OR Using Local PostgreSQL:**
```bash
# Create database manually
psql -U postgres
CREATE DATABASE lifelong_dashboard;
\q
```

### Step 3: Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

The default `.env` works with Docker. Edit if using custom PostgreSQL settings.

### Step 4: Initialize Database Schema

```bash
# From backend directory
npm run prisma:generate
npm run prisma:migrate
```

You should see output confirming migrations were applied.

### Step 5: Start Backend Server

```bash
# Development mode with hot reload
npm run start:dev
```

Backend runs on `http://localhost:3001`

### Step 6: Start Frontend

```bash
# From project root (new terminal)
npm run dev
```

Frontend runs on `http://localhost:3000`

## ✅ Verify Installation

1. **Check Backend Health:**
   ```bash
   curl http://localhost:3001
   ```

2. **Check Database Connection:**
   ```bash
   cd backend
   npm run prisma:studio
   ```
   Opens Prisma Studio at `http://localhost:5555`

3. **Test Frontend:**
   - Open `http://localhost:3000`
   - Navigate to "Outbound" - should show "No Data Available" message
   - This is correct! You need to upload data first.

## 📤 Upload Your First Outbound File

### Step 1: Prepare Excel File

Your Excel file should have these columns:

| Column | Header | Type | Example |
|--------|--------|------|---------|
| C | Customer Group | String | Amazon |
| K | Set Source Warehouse | String | WH-01 |
| L | SO Item | String | SKU123 |
| M | Category | String | Electronics |
| N | Sales Order Qty | Number | 100 |
| P | SO Total CBM | Number | 5.5 |
| S | DELIVERY Note DATE | Date | 2025-01-15 |
| U | DELIVERY Note ITEM | String | SKU123 |
| V | DELIVERY Note QTY | Number | 95 |
| W | DN Total CBM | Number | 5.2 |
| X | Transporter | String | BlueDart |

**Important Notes:**
- First row should be headers
- Data starts from row 2
- Date format: Excel date or ISO (YYYY-MM-DD)
- Numbers can have decimals

### Step 2: Upload via UI

1. Go to `http://localhost:3000/upload`
2. Select your Excel file (.xlsx or .xls)
3. Choose **"Outbound File"** from the file type options
4. Click **"Process File"**

You'll see an alert with the number of rows inserted.

### Step 3: View Data

1. Navigate to `http://localhost:3000/outbound`
2. You should now see:
   - 7 metric cards with real values
   - Category breakdown table
   - Month filter dropdown

### Step 4: Test Filtering

- **By Month**: Select a month from dropdown, click "Filter"
- **By Date Range**: Enter from/to dates, click "Filter"
- Data updates based on `delivery_note_date` field

## 🗂️ Project Structure

```
Lifelong Dashboard/
├── app/                          # Next.js frontend
│   └── (dashboard)/
│       ├── outbound/page.tsx    # ✨ Updated - real API calls
│       └── upload/page.tsx      # ✨ Updated - backend upload
├── backend/                      # ✨ NEW - NestJS backend
│   ├── src/
│   │   ├── main.ts              # Entry point
│   │   ├── app.module.ts        # Root module
│   │   ├── prisma/              # Database service
│   │   └── outbound/            # Outbound module
│   │       ├── outbound.controller.ts
│   │       ├── outbound.service.ts
│   │       └── category-normalizer.service.ts
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   ├── package.json
│   └── .env                     # Environment config
├── docker-compose.yml           # ✨ NEW - PostgreSQL setup
├── package.json                 # Frontend dependencies
└── PHASE2_SETUP.md             # This file
```

## 🔧 Troubleshooting

### Backend won't start

**Issue:** `Cannot find module '@nestjs/common'`
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

**Issue:** Database connection error
- Check PostgreSQL is running: `docker ps` or `pg_isready`
- Verify `.env` DATABASE_URL is correct
- Try: `docker-compose restart`

### Prisma errors

**Issue:** `prisma generate` fails
```bash
cd backend
npm install prisma @prisma/client --save-dev
npm run prisma:generate
```

**Issue:** Migration fails
```bash
# Reset and recreate
npm run prisma:migrate -- --name init
```

### Upload fails

**Issue:** 404 on upload
- Verify backend is running on port 3001
- Check browser console for CORS errors
- Ensure NEXT_PUBLIC_BACKEND_URL is set (or defaults to localhost:3001)

**Issue:** File parsing error
- Verify Excel file has correct column structure
- Check column letters match expected mapping (C, K, L, M, N, P, S, U, V, W, X)
- Ensure first row has headers

### No data on Outbound page

**Issue:** Empty state shows
- This is correct if no files uploaded yet!
- Upload a file first via Upload page
- Check backend logs for any errors

**Issue:** 404 error
- Backend might not be running
- Check `http://localhost:3001/outbound/summary` directly in browser
- Should return JSON or 404 if no uploads

## 📊 Category Classification

Customer groups are auto-classified:

| Category | Keywords (case-insensitive) |
|----------|----------------------------|
| **B2C** | decathlon, flipkart(b2c), snapmint, shopify, tatacliq, amazon b2c, pepperfry |
| **E-Commerce** | amazon, flipkart |
| **Quick-Commerce** | blinkit, swiggy, bigbasket, zepto |
| **Offline** | offline sales-b2b, offline – gt, offline - mt |
| **EBO** | store 2-lucknow, store3-zirakpur, store |
| **Others** | Everything else |

Classification happens during upload based on "Customer Group" column.

## 🔐 Environment Variables

**Backend (.env):**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lifelong_dashboard?schema=public"
PORT=3001
```

**Frontend (optional .env.local):**
```bash
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"
```

Default backend URL is `http://localhost:3001` if not set.

## 📚 API Documentation

### Upload Endpoint
```bash
POST http://localhost:3001/outbound/upload
Content-Type: multipart/form-data

# Using curl:
curl -X POST http://localhost:3001/outbound/upload \
  -F "file=@/path/to/outbound.xlsx"
```

### Summary Endpoint
```bash
GET http://localhost:3001/outbound/summary

# With filters:
GET http://localhost:3001/outbound/summary?fromDate=2025-01-01&toDate=2025-01-31
GET http://localhost:3001/outbound/summary?month=2025-01
```

## 🎓 Next Steps

1. **Upload More Data**: Test with different months to see filtering in action
2. **Explore Prisma Studio**: View/edit database directly at `http://localhost:5555`
3. **Customize Categories**: Edit `backend/src/outbound/category-normalizer.service.ts`
4. **Add More Uploads**: Future phases will add Inbound, Inventory, Billing

## 🐛 Common Issues

**Port 3001 already in use:**
```bash
# Change backend port in backend/.env
PORT=3002

# Update frontend to use new port
# In .env.local:
NEXT_PUBLIC_BACKEND_URL="http://localhost:3002"
```

**Docker PostgreSQL won't start:**
```bash
# Check if port 5432 is in use
netstat -an | grep 5432

# Stop existing PostgreSQL
sudo service postgresql stop   # Linux
brew services stop postgresql  # Mac

# Or change port in docker-compose.yml:
ports:
  - "5433:5432"  # Use 5433 on host
```

**"No processed uploads found" error:**
- This means database is empty
- Upload at least one Outbound Excel file
- Check upload status in Prisma Studio

## 📞 Support

If you encounter issues:
1. Check backend logs in terminal
2. Check browser console (F12)
3. Verify database with Prisma Studio
4. Review backend/README.md for detailed API docs

## 🎉 Success Checklist

- [ ] PostgreSQL running (Docker or local)
- [ ] Backend running on port 3001
- [ ] Frontend running on port 3000
- [ ] Excel file uploaded successfully
- [ ] Outbound page shows real data
- [ ] Filters work correctly
- [ ] Category table populated

Congratulations! Phase 2 is complete. 🚀
