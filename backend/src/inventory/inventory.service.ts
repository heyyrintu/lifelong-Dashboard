import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryNormalizerService } from '../outbound/category-normalizer.service';
import { ProductCategory } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export interface InventoryUploadResult {
  uploadId: string;
  rowsInserted: number;
  dateRange?: {
    minDate: string | null;
    maxDate: string | null;
  };
}

export interface InventoryCardMetrics {
  inboundSkuCount: number;
  inventoryQtyTotal: number;
  totalCbm: number;
}

export interface InventoryFilters {
  availableItemGroups: string[];
  availableDateRange: {
    minDate: string | null;
    maxDate: string | null;
  };
  availableProductCategories?: string[];
}

export interface InventoryTimeSeriesPoint {
  date: string;
  label: string;
  inventoryQty: number;
  edelInventoryQty: number;
  totalCbm: number;
  edelTotalCbm: number;
}

export interface InventoryTimeSeriesData {
  points: InventoryTimeSeriesPoint[];
}

export interface InventorySummaryResponse {
  cards: InventoryCardMetrics;
  filters: InventoryFilters;
  timeSeries: InventoryTimeSeriesData;
}

interface ParsedInventoryRow {
  item: string;
  warehouse: string;
  itemGroup: string;
  cbmPerUnit: number;
  isTotalRow: boolean;
  dailyQuantities: Array<{ date: Date; qty: number }>;
}

interface DateColumn {
  date: Date;
  columnIndex: number;
}

@Injectable()
export class InventoryService {
  private cache = new Map<string, InventorySummaryResponse>();

  constructor(
    private prisma: PrismaService,
    private categoryNormalizer: CategoryNormalizerService,
  ) {}

  /**
   * Parse and store Inventory (Daily Stock Analytics) Excel file
   */
  async uploadInventory(filePath: string, fileName: string): Promise<InventoryUploadResult> {
    const startTime = Date.now();
    let upload: any = null;
    
    try {
      // Create upload record with status "processing"
      upload = await this.prisma.inventoryUpload.create({
        data: {
          fileName,
          status: 'processing',
        },
      });

      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      
      // Find the correct sheet (Query Report or first sheet with data)
      let sheetName = workbook.SheetNames[0];
      for (const name of workbook.SheetNames) {
        if (name.toLowerCase().includes('query') || name.toLowerCase().includes('report')) {
          sheetName = name;
          break;
        }
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rawData.length < 2) {
        throw new Error('Excel file has no data rows');
      }

      // Row 1 (index 0) is header
      const headerRow = rawData[0];
      const dataRows = rawData.slice(1);

      // Detect date columns from H (index 7) to KL (index ~297)
      // We'll check headers from column 7 onwards
      const dateColumns: DateColumn[] = [];
      const START_DATE_COL = 7; // Column H (0-indexed)
      const END_DATE_COL = Math.min(headerRow.length, 300); // Up to column KL or end of headers

      for (let i = START_DATE_COL; i < END_DATE_COL; i++) {
        const headerCell = headerRow[i];
        const parsedDate = this.parseExcelDate(headerCell);
        if (parsedDate) {
          dateColumns.push({ date: parsedDate, columnIndex: i });
        }
      }

      console.log(`Detected ${dateColumns.length} date columns`);

      // Parse data rows
      const parsedRows: ParsedInventoryRow[] = [];

      for (const row of dataRows) {
        if (!row || row.length === 0) continue;

        // Fixed columns:
        // A (0) - Item
        // C (2) - Warehouse
        // D (3) - Item Group
        // G (6) - CBM per unit
        const item = this.getCellValue(row[0]);
        const warehouse = this.getCellValue(row[2]);
        const itemGroup = this.getCellValue(row[3]);
        const cbmPerUnit = this.parseNumber(row[6]);

        // Skip rows without item name
        if (!item) continue;

        // Build daily quantities from date columns
        const dailyQuantities: Array<{ date: Date; qty: number }> = [];
        for (const dateCol of dateColumns) {
          const qty = this.parseNumber(row[dateCol.columnIndex]);
          dailyQuantities.push({ date: dateCol.date, qty });
        }

        // Detect if this is the "Total" row (case-insensitive)
        const isTotalRow = item.trim().toLowerCase() === 'total';

        const normalizedItemGroup = itemGroup || 'Others';

        parsedRows.push({
          item,
          warehouse: warehouse || 'Unknown',
          itemGroup: normalizedItemGroup,
          cbmPerUnit: isTotalRow ? 0 : cbmPerUnit, // CBM not needed for Total row
          isTotalRow,
          dailyQuantities,
        });
      }

      console.log(`Parsed ${parsedRows.length} inventory rows`);

      // OPTIMIZATION: Batch insert all rows in a single transaction
      // Previous: O(2*N) queries (create row + createMany stocks per row)
      // After: O(2) queries (createMany rows + createMany all stocks)
      let totalDailyStocksInserted = 0;

      // Process in batches to avoid memory issues with very large files
      const BATCH_SIZE = 500;
      
      for (let batchStart = 0; batchStart < parsedRows.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, parsedRows.length);
        const batch = parsedRows.slice(batchStart, batchEnd);

        // Use transaction to ensure atomicity and consistency
        await this.prisma.$transaction(async (tx) => {
          // Step 1: Bulk create all InventoryRow records for this batch
          // Generate UUIDs client-side to avoid round-trip for IDs
          const rowsWithIds = batch.map((row, idx) => ({
            id: `${upload.id}-${batchStart + idx}`, // Deterministic ID based on upload and index
            uploadId: upload.id,
            item: row.item,
            warehouse: row.warehouse,
            itemGroup: row.itemGroup,
            cbmPerUnit: row.cbmPerUnit,
            isTotalRow: row.isTotalRow,
            productCategory: this.categoryNormalizer.normalizeProductCategory(row.itemGroup),
          }));

          await tx.inventoryRow.createMany({
            data: rowsWithIds,
          });

          // Step 2: Bulk create all InventoryDailyStock records
          // Flatten all daily quantities with their row references
          const allDailyStocks: Array<{
            inventoryRowId: string;
            stockDate: Date;
            quantity: number;
          }> = [];

          for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const rowId = rowsWithIds[i].id;
            
            for (const dq of row.dailyQuantities) {
              allDailyStocks.push({
                inventoryRowId: rowId,
                stockDate: dq.date,
                quantity: dq.qty,
              });
            }
          }

          if (allDailyStocks.length > 0) {
            await tx.inventoryDailyStock.createMany({
              data: allDailyStocks,
            });
            totalDailyStocksInserted += allDailyStocks.length;
          }
        });
      }

      // Update upload status to "processed"
      await this.prisma.inventoryUpload.update({
        where: { id: upload.id },
        data: { status: 'processed' },
      });

      // Clean up file
      fs.unlinkSync(filePath);

      // Clear cache
      this.cache.clear();

      // Get date range for response
      const dateRange = await this.getAvailableDateRange(upload.id);

      const elapsed = Date.now() - startTime;
      console.log(`Inventory upload complete: ${parsedRows.length} rows, ${totalDailyStocksInserted} daily stocks in ${elapsed}ms`);

      return {
        uploadId: upload.id,
        rowsInserted: parsedRows.length,
        dateRange,
      };
    } catch (error) {
      console.error('Error processing Inventory Excel file:', error);
      
      // Update upload status to "failed" if upload was created
      if (upload) {
        await this.prisma.inventoryUpload.update({
          where: { id: upload.id },
          data: { status: 'failed' },
        });
      }

      // Clean up file if it exists
      try {
        fs.unlinkSync(filePath);
      } catch {}

      const message = this.getErrorMessage(error);
      throw new Error(`Failed to process Inventory Excel file: ${message}`);
    }
  }

  /**
   * Get inventory summary with filters
   * 
   * OPTIMIZATION: Push aggregation to Postgres instead of fetching all rows into memory.
   * Previous: Fetch ALL rows + dailyStocks, aggregate in TypeScript
   * After: Use SQL aggregation, return only computed metrics
   * 
   * Performance improvement: ~95% reduction in data transfer for large datasets
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    itemGroup?: string,
    productCategories?: string[],
  ): Promise<InventorySummaryResponse> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${itemGroup || 'ALL'}-${(productCategories || []).sort().join(',') || 'ALL'}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Determine which upload to use
    let targetUploadId = uploadId;
    if (!targetUploadId) {
      const latestUpload = await this.prisma.inventoryUpload.findFirst({
        where: { status: 'processed' },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true }, // Only select id, not entire row
      });

      if (!latestUpload) {
        throw new NotFoundException('No processed inventory uploads found');
      }

      targetUploadId = latestUpload.id;
    }

    // Filter out 'ALL' from categories
    const productCategoryFilter = productCategories && productCategories.length > 0
      ? productCategories.filter(c => c !== 'ALL')
      : undefined;

    // Run parallel queries for filters and metrics
    // This reduces latency by not waiting for sequential queries
    const [availableDateRange, availableItemGroups, availableProductCategories, cards, timeSeries] = await Promise.all([
      this.getAvailableDateRange(targetUploadId),
      this.getAvailableItemGroups(targetUploadId),
      this.getAvailableProductCategories(targetUploadId),
      this.calculateCardMetricsOptimized(targetUploadId, fromDate, toDate, itemGroup, productCategoryFilter),
      this.generateTimeSeries(targetUploadId, fromDate, toDate, productCategoryFilter),
    ]);

    const result: InventorySummaryResponse = {
      cards,
      filters: {
        availableItemGroups,
        availableDateRange,
        availableProductCategories: ['ALL', ...availableProductCategories],
      },
      timeSeries,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(`getSummary: ${elapsed}ms (uploadId=${targetUploadId.substring(0, 8)}...)`);

    return result;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  /**
   * Calculate card metrics using optimized SQL aggregation
   * Pushes all computation to Postgres instead of fetching rows into memory.
   * 
   * Invariants:
   * - Assumes isTotalRow flag correctly identifies the Total row
   * - Assumes dailyStocks are immutable after insertion
   */
  private async calculateCardMetricsOptimized(
    uploadId: string,
    fromDate?: string,
    toDate?: string,
    itemGroup?: string,
    productCategories?: string[],
  ): Promise<InventoryCardMetrics> {
    // Build separate parameter arrays for each query type
    // Query 1 & 3: uploadId, fromDate?, toDate?, itemGroup?, productCategories?
    // Query 2: uploadId, fromDate?, toDate? (no itemGroup - it's for Total row)

    // Params for queries with itemGroup filter (Query 1 & 3)
    const paramsWithItemGroup: any[] = [uploadId];
    let paramIdx = 1;
    let dateFilterWithItemGroup = '';
    let itemGroupFilter = '';
    let productCategoryFilter = '';

    if (fromDate) {
      paramIdx++;
      paramsWithItemGroup.push(new Date(fromDate));
      dateFilterWithItemGroup += ` AND ids.stock_date >= $${paramIdx}`;
    }
    if (toDate) {
      paramIdx++;
      paramsWithItemGroup.push(new Date(toDate));
      dateFilterWithItemGroup += ` AND ids.stock_date <= $${paramIdx}`;
    }
    if (itemGroup && itemGroup !== 'ALL') {
      paramIdx++;
      paramsWithItemGroup.push(itemGroup);
      itemGroupFilter = ` AND ir.item_group = $${paramIdx}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${paramIdx + i + 1}::"ProductCategory"`).join(', ');
      paramsWithItemGroup.push(...productCategories);
      productCategoryFilter = ` AND ir.product_category IN (${placeholders})`;
    }

    // Run 3 parallel aggregation queries using $queryRawUnsafe with parameterized values
    const [inboundSkuResult, inventoryQtyResult, totalCbmResult] = await Promise.all([
      // Query 1: Inbound SKU Count
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(`
        SELECT COUNT(DISTINCT ir.item) as count
        FROM inventory_rows ir
        INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
        WHERE ir.upload_id = $1
          AND ir.is_total_row = false
          AND LOWER(TRIM(ir.item)) != 'total'
          AND ir.cbm_per_unit > 0
          ${dateFilterWithItemGroup}
          ${itemGroupFilter}
          ${productCategoryFilter}
      `, ...paramsWithItemGroup),

      // Query 2: Inventory QTY Total - sum of (average daily qty per SKU) across all SKUs
      // Formula: Σ over all non-Total rows ( AVG over dates in range (qty_sku_day) )
      this.prisma.$queryRawUnsafe<[{ total_qty: number | null }]>(`
        SELECT SUM(avg_qty) as total_qty FROM (
          SELECT AVG(ids.quantity) as avg_qty
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = $1
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            ${dateFilterWithItemGroup}
            ${itemGroupFilter}
            ${productCategoryFilter}
          GROUP BY ir.id
        ) subq
      `, ...paramsWithItemGroup),

      // Query 3: Total CBM
      this.prisma.$queryRawUnsafe<[{ total_cbm: number | null }]>(`
        SELECT SUM(row_cbm) as total_cbm FROM (
          SELECT 
            AVG(ids.quantity) * ir.cbm_per_unit as row_cbm
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = $1
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            AND ir.cbm_per_unit > 0
            ${dateFilterWithItemGroup}
            ${itemGroupFilter}
            ${productCategoryFilter}
          GROUP BY ir.id, ir.cbm_per_unit
          HAVING AVG(ids.quantity) > 0
        ) subq
      `, ...paramsWithItemGroup),
    ]);

    const inboundSkuCount = Number(inboundSkuResult[0]?.count || 0);
    const inventoryQtyTotal = Number(inventoryQtyResult[0]?.total_qty || 0);
    const totalCbm = Number(totalCbmResult[0]?.total_cbm || 0);

    return {
      inboundSkuCount,
      inventoryQtyTotal: Math.round(inventoryQtyTotal * 100) / 100,
      totalCbm: Math.round(totalCbm * 100) / 100,
    };
  }

  /**
   * Get list of inventory uploads
   */
  async getUploads() {
    const uploads = await this.prisma.inventoryUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        _count: {
          select: { rows: true },
        },
      },
    });

    return uploads.map((upload) => ({
      uploadId: upload.id,
      fileName: upload.fileName,
      uploadedAt: upload.uploadedAt.toISOString(),
      rowsInserted: upload._count.rows,
      status: upload.status,
      type: 'inventory',
    }));
  }

  /**
   * Delete an inventory upload and all associated data
   */
  async deleteUpload(uploadId: string): Promise<void> {
    // Check if upload exists
    const upload = await this.prisma.inventoryUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) {
      throw new NotFoundException(`Inventory upload with ID ${uploadId} not found`);
    }

    // Delete the upload (cascade will delete rows and daily stocks)
    await this.prisma.inventoryUpload.delete({
      where: { id: uploadId },
    });

    // Clear cache
    this.cache.clear();
  }

  /**
   * Calculate card metrics from filtered inventory rows
   * @param rows - Filtered SKU rows (excluding Total row)
   * @param totalRow - The Total row (if found) for Inventory QTY calculation
   * @param fromDate - Start date filter
   * @param toDate - End date filter
   */
  private calculateCardMetrics(
    rows: Array<{
      item: string;
      cbmPerUnit: number;
      isTotalRow: boolean;
      dailyStocks: Array<{ quantity: number; stockDate: Date }>;
    }>,
    totalRow: {
      item: string;
      cbmPerUnit: number;
      isTotalRow: boolean;
      dailyStocks: Array<{ quantity: number; stockDate: Date }>;
    } | undefined,
    fromDate?: Date,
    toDate?: Date,
  ): InventoryCardMetrics {
    // CARD #1: Inbound SKU Count
    // Count of unique items where cbmPerUnit > 0 and has at least one daily stock record
    // Excludes Total row
    const inboundSkuSet = new Set<string>();
    for (const row of rows) {
      if (row.cbmPerUnit > 0 && row.dailyStocks.length > 0) {
        inboundSkuSet.add(row.item);
      }
    }
    const inboundSkuCount = inboundSkuSet.size;

    // CARD #2: Inventory QTY Total
    // NEW: Use the Total row's average (AVERAGE of daily totals in date range)
    let inventoryQtyTotal = 0;

    if (totalRow && totalRow.dailyStocks.length > 0) {
      // Use Total row: compute average of daily totals within date range
      let sumOfTotals = 0;
      let daysCount = 0;

      for (const stock of totalRow.dailyStocks) {
        const stockDate = new Date(stock.stockDate);
        // Date filtering is already done in the query, but double-check if needed
        if (fromDate && stockDate < fromDate) continue;
        if (toDate && stockDate > toDate) continue;

        const qty = typeof stock.quantity === 'number' ? stock.quantity : Number(stock.quantity) || 0;
        sumOfTotals += qty;
        daysCount += 1;
      }

      inventoryQtyTotal = daysCount > 0 ? sumOfTotals / daysCount : 0;
    } else {
      // Fallback: old logic - sum of all daily stock quantities across all SKUs
      for (const row of rows) {
        for (const stock of row.dailyStocks) {
          inventoryQtyTotal += stock.quantity;
        }
      }
    }

    // CARD #3: Total CBM
    // Sum over all SKUs: (avg_qty_in_range * cbmPerUnit)
    // Skip rows with cbmPerUnit <= 0 or no daily stocks (they contribute 0 CBM)
    const totalCbm = this.computeTotalCbm(rows);

    return {
      inboundSkuCount,
      inventoryQtyTotal: Math.round(inventoryQtyTotal * 100) / 100,
      totalCbm: Math.round(totalCbm * 100) / 100,
    };
  }

  /**
   * Compute Total CBM across all SKU rows
   * Total CBM = Σ (avg_qty_in_range * cbmPerUnit) for each SKU
   * 
   * Optimizations:
   * - Skip rows with cbmPerUnit <= 0 (they contribute 0 CBM)
   * - Skip rows with no dailyStocks (no data in range)
   * - Use array length instead of manual counting
   * 
   * @param rows - Filtered SKU rows (Total row already excluded)
   */
  private computeTotalCbm(
    rows: Array<{
      cbmPerUnit: number;
      dailyStocks: Array<{ quantity: number }>;
    }>,
  ): number {
    let grandTotalCbm = 0;

    for (const row of rows) {
      // Fast path: skip rows that cannot contribute CBM
      if (!row.cbmPerUnit || row.cbmPerUnit <= 0) continue;

      const { dailyStocks } = row;
      if (!dailyStocks || dailyStocks.length === 0) continue;

      // Sum quantities across all daily stocks in range
      // (date filtering already done in query)
      let sumQty = 0;
      for (const stock of dailyStocks) {
        sumQty += stock.quantity;
      }

      // Calculate average and SKU's CBM contribution
      const avgQty = sumQty / dailyStocks.length;
      const skuCbm = avgQty * row.cbmPerUnit;

      if (skuCbm > 0) {
        grandTotalCbm += skuCbm;
      }
    }

    return grandTotalCbm;
  }

  /**
   * Generate simple daily time series for inventory qty and CBM
   */
  private async generateTimeSeries(
    uploadId: string,
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
  ): Promise<InventoryTimeSeriesData> {
    const where: any = {
      inventoryRow: {
        uploadId,
        isTotalRow: false,
      },
    };

    if (fromDate) {
      where.stockDate = { ...where.stockDate, gte: new Date(fromDate) };
    }
    if (toDate) {
      where.stockDate = { ...where.stockDate, lte: new Date(toDate) };
    }

    const filterByCategory = productCategories && productCategories.length > 0;

    const dailyStocks = await this.prisma.inventoryDailyStock.findMany({
      where,
      include: {
        inventoryRow: {
          select: {
            productCategory: true,
            cbmPerUnit: true,
          },
        },
      },
    });

    const groups: Record<string, {
      inventoryQty: number;
      edelInventoryQty: number;
      totalCbm: number;
      edelTotalCbm: number;
    }> = {};

    for (const row of dailyStocks) {
      const dateKey = row.stockDate.toISOString().split('T')[0];
      const category = row.inventoryRow.productCategory as ProductCategory | null;

      if (filterByCategory && category && !productCategories!.includes(category)) {
        continue;
      }

      if (!groups[dateKey]) {
        groups[dateKey] = {
          inventoryQty: 0,
          edelInventoryQty: 0,
          totalCbm: 0,
          edelTotalCbm: 0,
        };
      }

      const qty = Number(row.quantity) || 0;
      const cbmPerUnit = Number(row.inventoryRow.cbmPerUnit) || 0;
      const cbm = qty * cbmPerUnit;

      groups[dateKey].inventoryQty += qty;
      groups[dateKey].totalCbm += cbm;

      if (category === ProductCategory.EDEL) {
        groups[dateKey].edelInventoryQty += qty;
        groups[dateKey].edelTotalCbm += cbm;
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const points: InventoryTimeSeriesPoint[] = Object.keys(groups)
      .sort()
      .map((dateKey) => {
        const date = new Date(dateKey);
        const g = groups[dateKey];
        return {
          date: dateKey,
          label: `${date.getDate()} ${monthNames[date.getMonth()]}`,
          inventoryQty: Math.round(g.inventoryQty * 100) / 100,
          edelInventoryQty: Math.round(g.edelInventoryQty * 100) / 100,
          totalCbm: Math.round(g.totalCbm * 100) / 100,
          edelTotalCbm: Math.round(g.edelTotalCbm * 100) / 100,
        };
      });

    return { points };
  }

  /**
   * Get available date range for an upload
   */
  private async getAvailableDateRange(uploadId: string): Promise<{ minDate: string | null; maxDate: string | null }> {
    const result = await this.prisma.inventoryDailyStock.aggregate({
      where: {
        inventoryRow: {
          uploadId,
        },
      },
      _min: { stockDate: true },
      _max: { stockDate: true },
    });

    return {
      minDate: result._min.stockDate ? result._min.stockDate.toISOString().split('T')[0] : null,
      maxDate: result._max.stockDate ? result._max.stockDate.toISOString().split('T')[0] : null,
    };
  }

  /**
   * Get available item groups for an upload
   */
  private async getAvailableItemGroups(uploadId: string): Promise<string[]> {
    const rows = await this.prisma.inventoryRow.findMany({
      where: { uploadId },
      select: { itemGroup: true },
      distinct: ['itemGroup'],
    });

    const itemGroups = rows.map((r) => r.itemGroup).filter(Boolean).sort();
    return ['ALL', ...itemGroups];
  }

  /**
   * Get available product categories for an upload
   */
  private async getAvailableProductCategories(uploadId: string): Promise<string[]> {
    const rows = await this.prisma.inventoryRow.findMany({
      where: { uploadId },
      select: { productCategory: true },
      distinct: ['productCategory'],
    });

    return rows
      .map((r) => r.productCategory)
      .filter((c): c is ProductCategory => c !== null)
      .map((c) => c.toString())
      .sort();
  }

  // Helper methods
  private getCellValue(cell: any): string | null {
    if (cell === undefined || cell === null || cell === '') return null;
    return String(cell).trim();
  }

  private parseNumber(cell: any): number {
    if (cell === undefined || cell === null || cell === '') return 0;
    const num = Number(cell);
    return isNaN(num) ? 0 : num;
  }

  private parseExcelDate(cell: any): Date | null {
    if (!cell) return null;

    try {
      // Handle Excel serial date numbers
      if (typeof cell === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + cell * 86400000);
        // Validate it's a reasonable date (between 2000 and 2100)
        if (date.getFullYear() >= 2000 && date.getFullYear() <= 2100) {
          return date;
        }
        return null;
      }

      // Handle string dates
      if (typeof cell === 'string') {
        // Try various date formats
        const datePatterns = [
          /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
          /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
          /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
        ];

        for (const pattern of datePatterns) {
          if (pattern.test(cell)) {
            const date = new Date(cell);
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
              return date;
            }
          }
        }
      }

      // Try Date object parsing as fallback
      const date = new Date(cell);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2100) {
        return date;
      }

      return null;
    } catch {
      return null;
    }
  }
}
