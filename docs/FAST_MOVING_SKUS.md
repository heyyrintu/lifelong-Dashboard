# Inventory Analytics Features

## Overview

This document covers two key inventory analytics features:

1. **Fast-Moving SKUs Availability** - Monitor stock levels for high-velocity items
2. **Products With Zero Orders** - Identify dead stock and slow-moving inventory

Both features help warehouse managers optimize inventory and reduce costs.

---

## Table of Contents

### Fast-Moving SKUs
1. [Fast-Moving SKUs Description](#fast-moving-skus-description)
2. [How It Works](#how-it-works)
3. [Calculation Methods](#calculation-methods)
4. [Stock Status Classification](#stock-status-classification)
5. [Fast-Moving API Reference](#fast-moving-api-reference)

### Products With Zero Orders
6. [Zero-Order Products Description](#zero-order-products-description)
7. [Zero-Order Calculation Methods](#zero-order-calculation-methods)
8. [Stock Value Classification](#stock-value-classification)
9. [Zero-Order API Reference](#zero-order-api-reference)

### Common
10. [Frontend Usage](#frontend-usage)
11. [Data Model](#data-model)
12. [Examples](#examples)

---

## Fast-Moving SKUs Description

### What are Fast-Moving SKUs?

Fast-moving SKUs are inventory items that have:
- **High average daily quantity** in stock (configurable threshold, default: 50 units)
- **Significant stock movement** over time
- **Higher risk of stockout** due to rapid consumption

### Key Metrics Displayed

| Metric | Description |
|--------|-------------|
| **Avg Qty** | Average quantity in stock across all recorded days |
| **Latest Qty** | Most recent stock quantity recorded |
| **Min/Max** | Minimum and maximum quantities observed |
| **Days of Stock** | Estimated days until stockout based on consumption rate |
| **Stock Status** | Classification: Critical, Low, Adequate, or High |
| **CBM** | Cubic meters of storage space used |

---

## How It Works

### Data Flow

```
┌─────────────────────┐
│  Inventory Excel    │
│  (Daily Stock Data) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Upload & Parse     │
│  (inventory.service)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  PostgreSQL DB      │
│  - InventoryRow     │
│  - InventoryDaily   │
│    Stock            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  getFastMovingSkus  │
│  (SQL Aggregation)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Frontend Display   │
│  (Paginated Table)  │
└─────────────────────┘
```

### Process Steps

1. **Data Collection**: Daily stock quantities are uploaded via Excel files
2. **Storage**: Data is stored in `inventory_rows` and `inventory_daily_stock` tables
3. **Aggregation**: SQL queries calculate average, min, max, and latest quantities per SKU
4. **Classification**: Stock status is determined based on days of stock remaining
5. **Display**: Results are shown in a paginated, filterable table

---

## Calculation Methods

### 1. Average Quantity (Avg Qty)

```sql
AVG(daily_stock.quantity) per SKU
```

**Formula:**
```
Avg Qty = Sum of all daily quantities / Number of days with data
```

**Example:**
- Day 1: 100 units
- Day 2: 120 units
- Day 3: 80 units
- **Avg Qty = (100 + 120 + 80) / 3 = 100 units**

### 2. Latest Quantity

```sql
SELECT quantity 
FROM inventory_daily_stock 
WHERE stock_date = MAX(stock_date)
ORDER BY stock_date DESC
LIMIT 1
```

The most recent stock quantity recorded for each SKU-warehouse combination.

### 3. Min/Max Quantities

```sql
MIN(daily_stock.quantity) -- Minimum observed
MAX(daily_stock.quantity) -- Maximum observed
```

### 4. Days of Stock Calculation

```javascript
// Estimated daily consumption rate
const estimatedDailyConsumption = avgDailyQty * 0.1; // 10% turnover assumption

// Days of stock remaining
const daysOfStock = latestQty / estimatedDailyConsumption;
```

**Formula:**
```
Days of Stock = Latest Quantity / (Average Quantity × 0.1)
```

**Rationale:**
- We assume a 10% daily turnover rate for fast-moving items
- This means if average stock is 1000 units, approximately 100 units are consumed daily
- Adjust the 0.1 factor based on your actual turnover rates

**Example:**
- Latest Qty: 500 units
- Avg Qty: 1000 units
- Estimated Daily Consumption: 1000 × 0.1 = 100 units/day
- **Days of Stock = 500 / 100 = 5 days**

### 5. Total CBM (Cubic Meters)

```sql
AVG(quantity) * cbm_per_unit
```

**Formula:**
```
Total CBM = Average Quantity × CBM per Unit
```

---

## Stock Status Classification

| Status | Days of Stock | Color | Action Required |
|--------|---------------|-------|-----------------|
| 🔴 **Critical** | < 7 days | Red | Immediate replenishment needed |
| 🟠 **Low** | 7-14 days | Orange | Plan replenishment soon |
| 🟢 **Adequate** | 14-30 days | Green | Stock levels healthy |
| 🔵 **High** | > 30 days | Blue | Consider reducing orders |

### Classification Logic

```javascript
if (daysOfStock < 7) {
  stockStatus = 'critical';
} else if (daysOfStock < 14) {
  stockStatus = 'low';
} else if (daysOfStock < 30) {
  stockStatus = 'adequate';
} else {
  stockStatus = 'high';
}
```

---

## Fast-Moving API Reference

### Endpoint

```
GET /inventory/fast-moving-skus
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `warehouse` | string | `ALL` | Filter by warehouse name |
| `productCategory` | string | `ALL` | Filter by product category |
| `minAvgQty` | number | `50` | Minimum average quantity threshold |
| `limit` | number | `50` | Maximum number of results |

### Example Request

```bash
curl "http://localhost:3001/inventory/fast-moving-skus?warehouse=HR-11&minAvgQty=100&limit=20"
```

### Response Structure

```json
{
  "skus": [
    {
      "item": "SKU-001",
      "warehouse": "HR-11",
      "itemGroup": "Electronics",
      "productCategory": "ELECTRONICS",
      "avgDailyQty": 1500.50,
      "latestQty": 1200.00,
      "minQty": 800.00,
      "maxQty": 2000.00,
      "daysOfStock": 8,
      "stockStatus": "low",
      "cbmPerUnit": 0.0025,
      "totalCbm": 3.75
    }
  ],
  "summary": {
    "totalFastMovingSkus": 45,
    "criticalCount": 5,
    "lowCount": 12,
    "adequateCount": 20,
    "highCount": 8
  },
  "filters": {
    "availableWarehouses": ["ALL", "HR-11", "HR-12"],
    "availableProductCategories": ["ALL", "EDEL", "ELECTRONICS", "HOME_AND_KITCHEN"]
  }
}
```

---

## Zero-Order Products Description

### What are Zero-Order Products?

Zero-order products are inventory items that:
- **Have stock in inventory** (quantity > 0)
- **Have NO matching delivery notes** in outbound data
- **Are occupying warehouse space** without generating revenue

These are also known as **dead stock** or **slow-moving inventory**.

### Why Track Zero-Order Products?

| Issue | Impact |
|-------|--------|
| **Blocked Storage** | Warehouse space occupied by non-moving items |
| **Capital Lock-up** | Money tied up in unsold inventory |
| **Obsolescence Risk** | Products may expire or become outdated |
| **Handling Costs** | Ongoing storage and management costs |

### Key Metrics Displayed

| Metric | Description |
|--------|-------------|
| **Avg Stock Qty** | Average quantity in stock across all days |
| **Latest Stock Qty** | Most recent stock quantity |
| **Days in Stock** | Number of days the item has been in inventory |
| **Stock Value** | Classification based on CBM: High, Medium, Low |
| **CBM Blocked** | Cubic meters of storage space blocked |

---

## Zero-Order Calculation Methods

### 1. Identifying Zero-Order Products

```sql
-- Find inventory items NOT in outbound
SELECT inventory_items.*
FROM inventory_items
LEFT JOIN outbound_items ON inventory.item = outbound.delivery_note_item
WHERE outbound.item IS NULL  -- No matching outbound order
```

**Logic:**
1. Get all unique items from inventory data
2. Get all unique items from outbound delivery notes
3. Find items that exist in inventory but NOT in outbound
4. These are "zero-order" products

### 2. Days in Stock

```sql
COUNT(DISTINCT stock_date) as days_in_stock
```

This counts the number of distinct days the item has had stock records.

### 3. Total CBM Blocked

```sql
AVG(quantity) * cbm_per_unit as total_cbm
```

**Formula:**
```
CBM Blocked = Average Stock Quantity × CBM per Unit
```

---

## Stock Value Classification

Products are classified by the amount of storage space (CBM) they're blocking:

| Value | CBM Range | Color | Priority |
|-------|-----------|-------|----------|
| 🔴 **High** | ≥ 1 CBM | Red | Urgent - Review immediately |
| 🟡 **Medium** | 0.1 - 1 CBM | Yellow | Monitor - Plan action |
| 🟢 **Low** | < 0.1 CBM | Green | Low priority |

### Classification Logic

```javascript
if (totalCbm >= 1) {
  stockValue = 'high';
} else if (totalCbm >= 0.1) {
  stockValue = 'medium';
} else {
  stockValue = 'low';
}
```

---

## Zero-Order API Reference

### Endpoint

```
GET /inventory/zero-order-products
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `warehouse` | string | `ALL` | Filter by warehouse name |
| `productCategory` | string | `ALL` | Filter by product category |
| `minDaysInStock` | number | `7` | Minimum days in stock threshold |
| `limit` | number | `50` | Maximum number of results |

### Example Request

```bash
curl "http://localhost:3001/inventory/zero-order-products?warehouse=HR-11&minDaysInStock=14&limit=50"
```

### Response Structure

```json
{
  "products": [
    {
      "item": "SKU-DEAD-001",
      "warehouse": "HR-11",
      "itemGroup": "Electronics",
      "productCategory": "ELECTRONICS",
      "avgStockQty": 250.00,
      "latestStockQty": 245.00,
      "cbmPerUnit": 0.005,
      "totalCbm": 1.25,
      "daysInStock": 45,
      "stockValue": "high"
    }
  ],
  "summary": {
    "totalZeroOrderProducts": 120,
    "highValueCount": 15,
    "mediumValueCount": 45,
    "lowValueCount": 60,
    "totalCbmBlocked": 85.50
  },
  "filters": {
    "availableWarehouses": ["ALL", "HR-11", "HR-12"],
    "availableProductCategories": ["ALL", "EDEL", "ELECTRONICS", "HOME_AND_KITCHEN"]
  }
}
```

---

## Frontend Usage

### Location

Navigate to: `/inventory` → Scroll down to see both sections:
1. **Fast-Moving SKUs Availability** - High-velocity items
2. **Products With Zero Orders** - Dead stock analysis

### Features

1. **Summary Cards**: Quick overview of stock status distribution
2. **Filters**: 
   - Warehouse selector
   - Product category selector
   - Minimum average quantity input
3. **Paginated Table**: Shows 20 items per page with navigation
4. **Scrollable**: Table has max height with scroll for better UX
5. **Collapsible**: Section can be collapsed/expanded

### Filter Controls

```
┌─────────────────────────────────────────────────────────────┐
│ Warehouse: [ALL ▼]  Category: [ALL ▼]  Min Avg Qty: [50]   │
│                                              [🔄 Refresh]   │
└─────────────────────────────────────────────────────────────┘
```

### Pagination

```
Showing 1 - 20 of 45 SKUs
[First] [← Prev] [Page 1 of 3] [Next →] [Last]
```

---

## Data Model

### Database Tables

#### `inventory_rows`
```sql
CREATE TABLE inventory_rows (
  id UUID PRIMARY KEY,
  upload_id UUID REFERENCES inventory_uploads(id),
  item VARCHAR NOT NULL,
  warehouse VARCHAR NOT NULL,
  item_group VARCHAR NOT NULL,
  cbm_per_unit FLOAT DEFAULT 0,
  is_total_row BOOLEAN DEFAULT false,
  product_category ProductCategory DEFAULT 'OTHERS'
);
```

#### `inventory_daily_stock`
```sql
CREATE TABLE inventory_daily_stock (
  id UUID PRIMARY KEY,
  inventory_row_id UUID REFERENCES inventory_rows(id),
  stock_date DATE NOT NULL,
  quantity FLOAT DEFAULT 0
);
```

### SQL Query (Simplified)

```sql
WITH sku_stats AS (
  SELECT 
    ir.item,
    ir.warehouse,
    ir.item_group,
    ir.product_category,
    ir.cbm_per_unit,
    AVG(ids.quantity) as avg_qty,
    MIN(ids.quantity) as min_qty,
    MAX(ids.quantity) as max_qty
  FROM inventory_rows ir
  JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
  WHERE ir.is_total_row = false
  GROUP BY ir.item, ir.warehouse, ir.item_group, ir.product_category, ir.cbm_per_unit
  HAVING AVG(ids.quantity) >= :minAvgQty
),
latest_stock AS (
  SELECT DISTINCT ON (ir.item, ir.warehouse)
    ir.item, ir.warehouse, ids.quantity as latest_qty
  FROM inventory_rows ir
  JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
  ORDER BY ir.item, ir.warehouse, ids.stock_date DESC
)
SELECT * FROM sku_stats
LEFT JOIN latest_stock USING (item, warehouse)
ORDER BY avg_qty DESC
LIMIT :limit;
```

---

## Examples

### Example 1: Identifying Critical Stock

**Scenario**: Find all SKUs that need immediate attention

**Filter Settings**:
- Warehouse: ALL
- Category: ALL
- Min Avg Qty: 50

**Result**: Look for items with 🔴 Critical status (< 7 days of stock)

### Example 2: Warehouse-Specific Analysis

**Scenario**: Check fast-moving items in HR-11 warehouse only

**Filter Settings**:
- Warehouse: HR-11
- Category: ALL
- Min Avg Qty: 100

### Example 3: Category Focus

**Scenario**: Monitor electronics inventory

**Filter Settings**:
- Warehouse: ALL
- Category: ELECTRONICS
- Min Avg Qty: 50

---

## Customization

### Adjusting Turnover Rate

To change the daily consumption estimation, modify in `inventory.service.ts`:

```typescript
// Current: 10% turnover
const estimatedDailyConsumption = avgDailyQty * 0.1;

// For faster-moving items (20% turnover):
const estimatedDailyConsumption = avgDailyQty * 0.2;

// For slower-moving items (5% turnover):
const estimatedDailyConsumption = avgDailyQty * 0.05;
```

### Adjusting Stock Status Thresholds

Modify in `inventory.service.ts`:

```typescript
// Current thresholds
if (daysOfStock < 7) stockStatus = 'critical';
else if (daysOfStock < 14) stockStatus = 'low';
else if (daysOfStock < 30) stockStatus = 'adequate';
else stockStatus = 'high';

// Custom thresholds example
if (daysOfStock < 3) stockStatus = 'critical';
else if (daysOfStock < 7) stockStatus = 'low';
else if (daysOfStock < 14) stockStatus = 'adequate';
else stockStatus = 'high';
```

### Adjusting Items Per Page

Modify in `inventory/page.tsx`:

```typescript
const ITEMS_PER_PAGE = 20; // Change to desired number
```

---

## Troubleshooting

### No Data Displayed

1. Ensure inventory data has been uploaded
2. Check if `minAvgQty` threshold is too high
3. Verify warehouse/category filters aren't too restrictive

### Incorrect Days of Stock

1. Review the turnover rate assumption (0.1 = 10%)
2. Check if daily stock data is complete
3. Verify latest stock date is recent

### Performance Issues

1. Add database indexes on frequently queried columns
2. Reduce the `limit` parameter
3. Use more specific filters

---

## Related Documentation

- [Inventory Module Overview](./INVENTORY.md)
- [Data Upload Guide](./DATA_UPLOAD.md)
- [API Documentation](./API.md)

---

*Last Updated: December 2024*
