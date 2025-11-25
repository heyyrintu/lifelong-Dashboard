# Outbound Excel File Format

## Required Columns

Your outbound Excel file must have these specific columns. The **column letters** are important:

| Column Letter | Header Name | Data Type | Required | Example |
|--------------|-------------|-----------|----------|---------|
| **C** | Customer Group | Text | Yes | Amazon, Flipkart, Decathlon |
| **K** | Set Source Warehouse | Text | Yes | WH-MUMBAI-01 |
| **L** | SO Item | Text | Yes | SKU-12345 |
| **M** | Category | Text | Optional | Electronics |
| **N** | Sales Order Qty | Number | Yes | 100 |
| **P** | SO Total CBM | Number | Yes | 5.75 |
| **S** | DELIVERY Note DATE | Date | Yes | 2025-01-15 |
| **U** | DELIVERY Note ITEM | Text | Yes | SKU-12345 |
| **V** | DELIVERY Note QTY | Number | Yes | 95 |
| **W** | DN Total CBM | Number | Yes | 5.5 |
| **X** | Transporter | Text | Optional | BlueDart Express |

## Important Notes

### Column Position
- **The parser reads by column letter (C, K, L, M, etc.), NOT by header name**
- You can have other columns in between - they will be ignored
- Header row should be in row 1
- Data should start from row 2

### Data Types

**Numbers:**
- Can include decimals (e.g., 5.75, 100.50)
- Negative numbers are allowed
- Empty cells default to 0

**Dates:**
- Excel date format is preferred
- Also accepts: YYYY-MM-DD (e.g., 2025-01-15)
- Empty dates are allowed (will be null)

**Text:**
- Any text is valid
- Empty cells are stored as null

### Sample Excel Structure

```
Row 1:  | A | B | C: Customer Group | ... | K: Warehouse | L: SO Item | M: Category | N: SO Qty | ... |
Row 2:  | x | x | Amazon            | ... | WH-01        | SKU-001    | Electronics | 100       | ... |
Row 3:  | x | x | Flipkart          | ... | WH-02        | SKU-002    | Fashion     | 50        | ... |
```

## Category Auto-Classification

Based on the **Customer Group** (Column C) value, rows are automatically classified:

### B2C
Keywords: decathlon, flipkart(b2c), snapmint, shopify, tatacliq, amazon b2c, pepperfry

### E-Commerce
Keywords: amazon, flipkart (generic)

### Quick-Commerce
Keywords: blinkit, swiggy, bigbasket, zepto

### Offline
Keywords: offline sales-b2b, offline – gt, offline - mt

### EBO (Exclusive Brand Outlets)
Keywords: store 2-lucknow, store3-zirakpur, any text with "store"

### Others
Anything that doesn't match above keywords

**Note:** Classification is case-insensitive. "AMAZON" and "amazon" are treated the same.

## Example Valid File

```
| A | B | C           | D | E | F | G | H | I | J | K        | L       | M           | N   | O | P    | Q | R | S          | T | U       | V  | W    | X          |
|---|---|-------------|---|---|---|---|---|---|---|----------|---------|-------------|-----|---|------|---|---|------------|---|---------|----|----- |------------|
| 1 | 2 | Amazon      | - | - | - | - | - | - | - | WH-MUM-1 | SKU-100 | Electronics | 150 | - | 7.5  | - | - | 2025-01-10 | - | SKU-100 | 145| 7.25 | BlueDart   |
| 2 | 3 | Blinkit     | - | - | - | - | - | - | - | WH-DEL-2 | SKU-200 | Grocery     | 200 | - | 10.0 | - | - | 2025-01-11 | - | SKU-200 | 200| 10.0 | Delhivery  |
| 3 | 4 | Offline-GT  | - | - | - | - | - | - | - | WH-BLR-1 | SKU-300 | Fashion     | 75  | - | 3.2  | - | - | 2025-01-12 | - | SKU-300 | 70 | 3.0  | FedEx      |
```

## Validation Rules

The backend will:
- ✅ Accept files up to 10MB
- ✅ Parse .xlsx and .xls formats
- ✅ Skip empty rows automatically
- ✅ Convert invalid numbers to 0
- ✅ Store invalid dates as null
- ✅ Trim whitespace from text fields

## Common Errors

**"Upload failed"**
- Check file is .xlsx or .xls format
- Verify file size is under 10MB
- Ensure columns C, K, L, M, N, P, S, U, V, W, X exist

**"No data visible after upload"**
- Check that row 1 has headers
- Data should start from row 2
- At least one valid date in column S is needed for filtering

**"Wrong category classification"**
- Category is based on exact keyword match in Customer Group (Column C)
- Check spelling and spacing
- Classification is case-insensitive

## Testing Your File

Before uploading to production:

1. **Check Column Letters**: Verify C, K, L, M, N, P, S, U, V, W, X are in correct positions
2. **Check Data Types**: Numbers in number columns, dates in date column
3. **Check Dates**: Column S should have valid dates (most important for filtering)
4. **Sample Upload**: Upload a small sample (10-20 rows) first
5. **Verify in Prisma Studio**: After upload, check database via `npm run prisma:studio`

## Template Download

You can create a template with these exact column letters and save it as a reference for your team.

---

Need help? Check the main [PHASE2_SETUP.md](../PHASE2_SETUP.md) guide.
