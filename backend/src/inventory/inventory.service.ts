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
  availableWarehouses: string[];
  timeSeries: InventoryTimeSeriesData;
}

export interface FastMovingSku {
  item: string;
  warehouse: string;
  itemGroup: string;
  productCategory: string;
  avgDailyQty: number;
  latestQty: number;
  minQty: number;
  maxQty: number;
  daysOfStock: number; // Estimated days of stock remaining based on avg consumption
  stockStatus: 'critical' | 'low' | 'adequate' | 'high';
  cbmPerUnit: number;
  totalCbm: number;
  // Sales data from outbound (DN = Delivery Note)
  avgDailySales: number; // Average daily sales (units/day) from outbound
  totalSalesQty: number; // Total DN Qty for this SKU
  totalSalesCbm: number; // Total DN CBM for this SKU
}

export interface FastMovingSkusResponse {
  skus: FastMovingSku[];
  summary: {
    totalFastMovingSkus: number;
    criticalCount: number;
    lowCount: number;
    adequateCount: number;
    highCount: number;
  };
  filters: {
    availableWarehouses: string[];
    availableProductCategories: string[];
  };
}

export interface ZeroOrderProduct {
  item: string;
  warehouse: string;
  itemGroup: string;
  productCategory: string;
  avgStockQty: number;
  latestStockQty: number;
  cbmPerUnit: number;
  totalCbm: number;
  daysInStock: number; // How many days this item has been sitting in inventory
  stockValue: string; // Classification: high, medium, low based on CBM
}

export interface ZeroOrderProductsResponse {
  products: ZeroOrderProduct[];
  summary: {
    totalZeroOrderProducts: number;
    highValueCount: number;
    mediumValueCount: number;
    lowValueCount: number;
    totalCbmBlocked: number;
  };
  filters: {
    availableWarehouses: string[];
    availableProductCategories: string[];
  };
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
  // Cache version - increment to invalidate all cached data after logic changes
  private readonly CACHE_VERSION = 'v15';

  constructor(
    private prisma: PrismaService,
    private categoryNormalizer: CategoryNormalizerService,
  ) {
    // Clear cache on service initialization to ensure fresh data after deployments
    this.cache.clear();
  }

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
        // IMPORTANT: Only store cells with actual values (including 0)
        // Skip blank/empty cells so they don't affect the average calculation
        const dailyQuantities: Array<{ date: Date; qty: number }> = [];
        for (const dateCol of dateColumns) {
          const cellValue = row[dateCol.columnIndex];
          // Skip blank/empty cells - they should not be included in average
          // But include actual 0 values (when cell explicitly contains 0)
          if (cellValue === undefined || cellValue === null || cellValue === '') {
            continue; // Skip blank cells
          }
          const qty = this.parseNumber(cellValue);
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
      const dateRange = await this.getAvailableDateRange([upload.id]);

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
    warehouse?: string,
  ): Promise<InventorySummaryResponse> {
    const startTime = Date.now();

    // Generate cache key with version to invalidate after logic changes
    // 'all' when no uploadId specified = aggregate across all uploads
    const cacheKey = `${this.CACHE_VERSION}-${uploadId || 'all'}-${fromDate || ''}-${toDate || ''}-${itemGroup || 'ALL'}-${(productCategories || []).sort().join(',') || 'ALL'}-${warehouse || 'ALL'}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Determine which upload(s) to use
    // If uploadId is specified, use that specific upload
    // If not specified, aggregate data from ALL processed uploads
    let targetUploadIds: string[] = [];
    if (uploadId) {
      targetUploadIds = [uploadId];
    } else {
      const allUploads = await this.prisma.inventoryUpload.findMany({
        where: { status: 'processed' },
        select: { id: true },
      });

      if (allUploads.length === 0) {
        throw new NotFoundException('No processed inventory uploads found');
      }

      targetUploadIds = allUploads.map(u => u.id);
    }

    // Filter out 'ALL' from categories
    const productCategoryFilter = productCategories && productCategories.length > 0
      ? productCategories.filter(c => c !== 'ALL')
      : undefined;

    // Build warehouse filter
    const warehouseFilter = warehouse && warehouse !== 'ALL' ? warehouse : undefined;

    // Run parallel queries for filters and metrics
    // This reduces latency by not waiting for sequential queries
    // (aggregating across all uploads if multiple)
    const [availableDateRange, availableItemGroups, availableProductCategories, availableWarehouses, cards, timeSeries] = await Promise.all([
      this.getAvailableDateRange(targetUploadIds),
      this.getAvailableItemGroups(targetUploadIds),
      this.getAvailableProductCategories(targetUploadIds),
      this.getAvailableWarehouses(targetUploadIds),
      this.calculateCardMetricsOptimized(targetUploadIds, fromDate, toDate, itemGroup, productCategoryFilter, warehouseFilter),
      this.generateTimeSeries(targetUploadIds, fromDate, toDate, productCategoryFilter, warehouseFilter),
    ]);

    const result: InventorySummaryResponse = {
      cards,
      filters: {
        availableItemGroups,
        availableDateRange,
        availableProductCategories: ['ALL', ...availableProductCategories],
      },
      availableWarehouses,
      timeSeries,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(`getSummary: ${elapsed}ms (uploadIds=${targetUploadIds.length} uploads)`);

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
   * Supports multiple upload IDs for aggregating across all uploads
   * 
   * Card Metrics Logic:
   * - Inbound SKU Count: Count of unique items with CBM > 0 in the date range
   * - Inventory QTY Total: Average of daily totals (SUM per day, then AVG across days)
   * - Total CBM: Average of daily CBM totals (consistent with Inventory QTY)
   */
  private async calculateCardMetricsOptimized(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    itemGroup?: string,
    productCategories?: string[],
    warehouse?: string,
  ): Promise<InventoryCardMetrics> {
    // Build parameterized query
    const params: any[] = [uploadIds];
    let paramIdx = 1;
    let dateFilter = '';
    let itemGroupFilter = '';
    let productCategoryFilter = '';
    let warehouseFilter = '';

    if (fromDate) {
      paramIdx++;
      params.push(new Date(fromDate));
      dateFilter += ` AND ids.stock_date >= $${paramIdx}`;
    }
    if (toDate) {
      paramIdx++;
      params.push(new Date(toDate));
      dateFilter += ` AND ids.stock_date <= $${paramIdx}`;
    }
    if (itemGroup && itemGroup !== 'ALL') {
      paramIdx++;
      params.push(itemGroup);
      itemGroupFilter = ` AND ir.item_group = $${paramIdx}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${paramIdx + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      productCategoryFilter = ` AND ir.product_category IN (${placeholders})`;
    }
    if (warehouse) {
      paramIdx++;
      params.push(warehouse);
      warehouseFilter = ` AND ir.warehouse = $${paramIdx}`;
    }

    // Run 3 parallel aggregation queries
    // Include ALL rows (including duplicates), exclude only Total row
    // IMPORTANT: Exclude quantity = 0 from AVG calculation to match Excel's AVERAGE behavior
    // (Excel's AVERAGE ignores empty cells, but we stored empty as 0)
    const [inboundSkuResult, inventoryQtyResult, totalCbmResult] = await Promise.all([
      // Query 1: Inbound SKU Count - count distinct items with CBM > 0 and at least one non-zero qty
      this.prisma.$queryRawUnsafe<[{ count: number }]>(`
        SELECT COUNT(DISTINCT ir.item)::integer as count
        FROM inventory_rows ir
        INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
        WHERE ir.upload_id = ANY($1)
          AND ir.is_total_row = false
          AND LOWER(TRIM(ir.item)) != 'total'
          AND ir.cbm_per_unit > 0
          AND ids.quantity > 0
          ${dateFilter}
          ${itemGroupFilter}
          ${productCategoryFilter}
          ${warehouseFilter}
      `, ...params),

      // Query 2: Inventory QTY Total - Sum of (AVG qty per row)
      // Matches Excel: For each row, AVERAGE(daily_qty), then SUM all row averages
      // NOTE: Excel AVERAGE includes 0 values but ignores blank cells
      // Since we store blank as 0, we include all values (including 0s)
      this.prisma.$queryRawUnsafe<[{ total_avg_qty: number | null }]>(`
        SELECT COALESCE(SUM(row_avg_qty), 0)::numeric as total_avg_qty FROM (
          SELECT AVG(ids.quantity)::numeric as row_avg_qty
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            ${dateFilter}
            ${itemGroupFilter}
            ${productCategoryFilter}
            ${warehouseFilter}
          GROUP BY ir.id
        ) row_averages
      `, ...params),

      // Query 3: Total CBM - Sum of (AVG qty * cbm_per_unit) per row
      // Matches Excel: AVG_QTY × CBM_per_unit for each row, then SUM all
      this.prisma.$queryRawUnsafe<[{ total_cbm: number | null }]>(`
        SELECT COALESCE(SUM(row_cbm), 0)::numeric as total_cbm FROM (
          SELECT (AVG(ids.quantity) * ir.cbm_per_unit)::numeric as row_cbm
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            ${dateFilter}
            ${itemGroupFilter}
            ${productCategoryFilter}
            ${warehouseFilter}
          GROUP BY ir.id, ir.cbm_per_unit
        ) row_cbm_totals
      `, ...params),
    ]);

    console.log('RAW RESULTS:', {
      inboundSkuResult: inboundSkuResult[0],
      inventoryQtyResult: inventoryQtyResult[0],
      totalCbmResult: totalCbmResult[0],
    });

    // Handle Prisma Decimal type - convert to string first then to number
    const inboundSkuCount = Number(inboundSkuResult[0]?.count ?? 0);
    const qtyRaw = (inventoryQtyResult[0] as any)?.total_avg_qty;
    const cbmRaw = totalCbmResult[0]?.total_cbm;
    
    // Prisma Decimal has toString() method
    const inventoryQtyTotal = qtyRaw ? Number(String(qtyRaw)) : 0;
    const totalCbm = cbmRaw ? Number(String(cbmRaw)) : 0;

    console.log('PARSED VALUES:', { inboundSkuCount, inventoryQtyTotal, totalCbm });

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
   * Generate daily time series for inventory qty and CBM
   * 
   * OPTIMIZATION: Use SQL aggregation instead of fetching all rows into memory.
   * This dramatically improves performance for large datasets.
   * Supports multiple upload IDs for aggregating across all uploads
   */
  private async generateTimeSeries(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
    warehouse?: string,
  ): Promise<InventoryTimeSeriesData> {
    // Build parameterized query
    const params: any[] = [uploadIds];
    let paramIdx = 1;
    let dateFilter = '';
    let categoryFilter = '';
    let warehouseFilter = '';

    if (fromDate) {
      paramIdx++;
      params.push(new Date(fromDate));
      dateFilter += ` AND ids.stock_date >= $${paramIdx}`;
    }
    if (toDate) {
      paramIdx++;
      params.push(new Date(toDate));
      dateFilter += ` AND ids.stock_date <= $${paramIdx}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${paramIdx + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      categoryFilter = ` AND ir.product_category IN (${placeholders})`;
    }
    if (warehouse) {
      paramIdx++;
      params.push(warehouse);
      warehouseFilter = ` AND ir.warehouse = $${paramIdx}`;
    }

    // Single optimized SQL query that aggregates by date
    // Include all quantities (including 0s) to match Excel SUM behavior
    const results = await this.prisma.$queryRawUnsafe<Array<{
      stock_date: Date;
      inventory_qty: number;
      edel_inventory_qty: number;
      total_cbm: number;
      edel_total_cbm: number;
    }>>(`
      SELECT 
        ids.stock_date,
        SUM(ids.quantity) as inventory_qty,
        SUM(CASE WHEN ir.product_category = 'EDEL' THEN ids.quantity ELSE 0 END) as edel_inventory_qty,
        SUM(ids.quantity * ir.cbm_per_unit) as total_cbm,
        SUM(CASE WHEN ir.product_category = 'EDEL' THEN ids.quantity * ir.cbm_per_unit ELSE 0 END) as edel_total_cbm
      FROM inventory_daily_stock ids
      INNER JOIN inventory_rows ir ON ir.id = ids.inventory_row_id
      WHERE ir.upload_id = ANY($1)
        AND ir.is_total_row = false
        ${dateFilter}
        ${categoryFilter}
        ${warehouseFilter}
      GROUP BY ids.stock_date
      ORDER BY ids.stock_date
    `, ...params);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const points: InventoryTimeSeriesPoint[] = results.map((row) => {
      const date = new Date(row.stock_date);
      const dateKey = date.toISOString().split('T')[0];
      return {
        date: dateKey,
        label: `${date.getDate()} ${monthNames[date.getMonth()]}`,
        inventoryQty: Math.round(Number(row.inventory_qty || 0) * 100) / 100,
        edelInventoryQty: Math.round(Number(row.edel_inventory_qty || 0) * 100) / 100,
        totalCbm: Math.round(Number(row.total_cbm || 0) * 100) / 100,
        edelTotalCbm: Math.round(Number(row.edel_total_cbm || 0) * 100) / 100,
      };
    });

    return { points };
  }

  /**
   * Get available date range for uploads
   * Supports multiple upload IDs
   */
  private async getAvailableDateRange(uploadIds: string[]): Promise<{ minDate: string | null; maxDate: string | null }> {
    const result = await this.prisma.inventoryDailyStock.aggregate({
      where: {
        inventoryRow: {
          uploadId: { in: uploadIds },
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
   * Get available item groups for uploads
   * Supports multiple upload IDs
   */
  private async getAvailableItemGroups(uploadIds: string[]): Promise<string[]> {
    const rows = await this.prisma.inventoryRow.findMany({
      where: { uploadId: { in: uploadIds } },
      select: { itemGroup: true },
      distinct: ['itemGroup'],
    });

    const itemGroups = rows.map((r) => r.itemGroup).filter(Boolean).sort();
    return ['ALL', ...itemGroups];
  }

  /**
   * Get available product categories for uploads
   * Supports multiple upload IDs
   */
  private async getAvailableProductCategories(uploadIds: string[]): Promise<string[]> {
    const rows = await this.prisma.inventoryRow.findMany({
      where: { uploadId: { in: uploadIds } },
      select: { productCategory: true },
      distinct: ['productCategory'],
    });

    return rows
      .map((r) => r.productCategory)
      .filter((c): c is ProductCategory => c !== null)
      .map((c) => c.toString())
      .sort();
  }

  /**
   * Get available warehouses from all uploads
   * Returns distinct warehouse values
   */
  private async getAvailableWarehouses(uploadIds: string[]): Promise<string[]> {
    const rows = await this.prisma.inventoryRow.findMany({
      where: { uploadId: { in: uploadIds } },
      select: { warehouse: true },
      distinct: ['warehouse'],
    });

    const warehouses = rows
      .map((r) => r.warehouse)
      .filter((w): w is string => w !== null && w !== '')
      .sort();
    
    return ['ALL', ...warehouses];
  }

/**
   * Get fast-moving SKUs with availability analysis
   * 
   * Fast-moving SKUs are identified by:
   * 1. High average daily quantity (top percentile)
   * 2. Significant stock movement over time
   * 
   * Stock status is determined by comparing latest stock to average consumption:
   * - Critical: < 7 days of stock
   * - Low: 7-14 days of stock
   * - Adequate: 14-30 days of stock
   * - High: > 30 days of stock
   */
  async getFastMovingSkus(
    warehouse?: string,
    productCategory?: string,
    minAvgQty?: number,
    limit?: number,
  ): Promise<FastMovingSkusResponse> {
    const startTime = Date.now();

    // Get all processed inventory uploads
    const allUploads = await this.prisma.inventoryUpload.findMany({
      where: { status: 'processed' },
      select: { id: true },
    });

    if (allUploads.length === 0) {
      throw new NotFoundException('No processed inventory uploads found');
    }

    const uploadIds = allUploads.map(u => u.id);

    // Get all processed outbound uploads for sales data
    const outboundUploads = await this.prisma.outboundUpload.findMany({
      where: { status: 'processed' },
      select: { id: true },
    });
    const outboundUploadIds = outboundUploads.map(u => u.id);

    // Build filters
    const params: any[] = [uploadIds];
    let paramIdx = 1;
    let warehouseFilter = '';
    let categoryFilter = '';

    if (warehouse && warehouse !== 'ALL') {
      paramIdx++;
      params.push(warehouse);
      warehouseFilter = ` AND ir.warehouse = $${paramIdx}`;
    }

    if (productCategory && productCategory !== 'ALL') {
      paramIdx++;
      params.push(productCategory);
      categoryFilter = ` AND ir.product_category::text = $${paramIdx}`;
    }

    // Minimum average quantity threshold (default: 50 units/day for fast-moving)
    const minQtyThreshold = minAvgQty || 50;
    paramIdx++;
    params.push(minQtyThreshold);

    // Limit results (default: 50)
    const resultLimit = limit || 50;
    paramIdx++;
    params.push(resultLimit);

    // Add outbound upload IDs to params if available
    let outboundUploadIdsParamIdx = 0;
    if (outboundUploadIds.length > 0) {
      paramIdx++;
      params.push(outboundUploadIds);
      outboundUploadIdsParamIdx = paramIdx;
    }

    // Query to get fast-moving SKUs with their stock metrics and sales data from outbound
    const salesJoin = outboundUploadIds.length > 0 ? `
      ,
      sales_data AS (
        SELECT 
          delivery_note_item as item,
          COALESCE(SUM(delivery_note_qty), 0) as total_sales_qty,
          COALESCE(SUM(dn_total_cbm), 0) as total_sales_cbm,
          COUNT(DISTINCT DATE(delivery_note_date)) as sales_days
        FROM outbound_rows
        WHERE upload_id = ANY($${outboundUploadIdsParamIdx})
          AND delivery_note_item IS NOT NULL
          AND delivery_note_qty > 0
        GROUP BY delivery_note_item
      )
    ` : '';

    const salesSelect = outboundUploadIds.length > 0 ? `
        COALESCE(sd.total_sales_qty, 0) as total_sales_qty,
        COALESCE(sd.total_sales_cbm, 0) as total_sales_cbm,
        COALESCE(sd.sales_days, 0) as sales_days,
    ` : `
        0 as total_sales_qty,
        0 as total_sales_cbm,
        0 as sales_days,
    `;

    const salesLeftJoin = outboundUploadIds.length > 0 
      ? `LEFT JOIN sales_data sd ON LOWER(TRIM(ss.item)) = LOWER(TRIM(sd.item))`
      : '';

    const results = await this.prisma.$queryRawUnsafe<Array<{
      item: string;
      warehouse: string;
      item_group: string;
      product_category: string;
      avg_qty: number;
      latest_qty: number;
      min_qty: number;
      max_qty: number;
      cbm_per_unit: number;
      total_cbm: number;
      latest_date: Date;
      total_sales_qty: number;
      total_sales_cbm: number;
      sales_days: number;
    }>>(`
      WITH sku_stats AS (
        SELECT 
          ir.item,
          ir.warehouse,
          ir.item_group,
          ir.product_category::text as product_category,
          ir.cbm_per_unit,
          AVG(ids.quantity) as avg_qty,
          MIN(ids.quantity) as min_qty,
          MAX(ids.quantity) as max_qty,
          (AVG(ids.quantity) * ir.cbm_per_unit) as total_cbm
        FROM inventory_rows ir
        INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
        WHERE ir.upload_id = ANY($1)
          AND ir.is_total_row = false
          AND LOWER(TRIM(ir.item)) != 'total'
          ${warehouseFilter}
          ${categoryFilter}
        GROUP BY ir.item, ir.warehouse, ir.item_group, ir.product_category, ir.cbm_per_unit
        HAVING AVG(ids.quantity) > 0
      ),
      latest_stock AS (
        SELECT DISTINCT ON (ir.item, ir.warehouse)
          ir.item,
          ir.warehouse,
          ids.quantity as latest_qty,
          ids.stock_date as latest_date
        FROM inventory_rows ir
        INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
        WHERE ir.upload_id = ANY($1)
          AND ir.is_total_row = false
        ORDER BY ir.item, ir.warehouse, ids.stock_date DESC
      )
      ${salesJoin}
      SELECT 
        ss.item,
        ss.warehouse,
        ss.item_group,
        ss.product_category,
        ss.avg_qty,
        COALESCE(ls.latest_qty, 0) as latest_qty,
        ss.min_qty,
        ss.max_qty,
        ss.cbm_per_unit,
        ss.total_cbm,
        ls.latest_date,
        ${salesSelect}
        1 as dummy
      FROM sku_stats ss
      LEFT JOIN latest_stock ls ON ls.item = ss.item AND ls.warehouse = ss.warehouse
      ${salesLeftJoin}
      WHERE ss.avg_qty >= $${paramIdx - (outboundUploadIds.length > 0 ? 2 : 1)}
      ORDER BY ss.avg_qty DESC
      LIMIT $${paramIdx - (outboundUploadIds.length > 0 ? 1 : 0)}
    `, ...params);

    // Process results and calculate stock status
    const skus: FastMovingSku[] = results.map(row => {
      const avgDailyQty = Number(row.avg_qty) || 0;
      const latestQty = Number(row.latest_qty) || 0;
      const totalSalesQty = Number(row.total_sales_qty) || 0;
      const totalSalesCbm = Number(row.total_sales_cbm) || 0;
      const salesDays = Number(row.sales_days) || 1; // Avoid division by zero
      
      // Calculate average daily sales (units/day)
      const avgDailySales = salesDays > 0 ? totalSalesQty / salesDays : 0;
      
      // Calculate days of stock based on actual sales data if available, otherwise use estimate
      let daysOfStock: number;
      if (avgDailySales > 0) {
        // Use actual sales data for more accurate days of stock calculation
        daysOfStock = Math.round(latestQty / avgDailySales);
      } else {
        // Fallback: estimate based on 10% daily turnover assumption
        const estimatedDailyConsumption = avgDailyQty * 0.1;
        daysOfStock = estimatedDailyConsumption > 0 
          ? Math.round(latestQty / estimatedDailyConsumption) 
          : 999;
      }

      // Determine stock status
      let stockStatus: 'critical' | 'low' | 'adequate' | 'high';
      if (daysOfStock < 7) {
        stockStatus = 'critical';
      } else if (daysOfStock < 14) {
        stockStatus = 'low';
      } else if (daysOfStock < 30) {
        stockStatus = 'adequate';
      } else {
        stockStatus = 'high';
      }

      return {
        item: row.item,
        warehouse: row.warehouse,
        itemGroup: row.item_group,
        productCategory: row.product_category,
        avgDailyQty: Math.round(avgDailyQty * 100) / 100,
        latestQty: Math.round(latestQty * 100) / 100,
        minQty: Math.round(Number(row.min_qty) * 100) / 100,
        maxQty: Math.round(Number(row.max_qty) * 100) / 100,
        daysOfStock,
        stockStatus,
        cbmPerUnit: Math.round(Number(row.cbm_per_unit) * 10000) / 10000,
        totalCbm: Math.round(Number(row.total_cbm) * 100) / 100,
        // Sales data from outbound
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        totalSalesQty: Math.round(totalSalesQty),
        totalSalesCbm: Math.round(totalSalesCbm * 100) / 100,
      };
    });

    // Calculate summary counts
    const summary = {
      totalFastMovingSkus: skus.length,
      criticalCount: skus.filter(s => s.stockStatus === 'critical').length,
      lowCount: skus.filter(s => s.stockStatus === 'low').length,
      adequateCount: skus.filter(s => s.stockStatus === 'adequate').length,
      highCount: skus.filter(s => s.stockStatus === 'high').length,
    };

    // Get available filters
    const [availableWarehouses, availableProductCategories] = await Promise.all([
      this.getAvailableWarehouses(uploadIds),
      this.getAvailableProductCategories(uploadIds),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`getFastMovingSkus: ${elapsed}ms, found ${skus.length} SKUs`);

    return {
      skus,
      summary,
      filters: {
        availableWarehouses,
        availableProductCategories: ['ALL', ...availableProductCategories],
      },
    };
  }

/**
   * Get products with zero orders (items in inventory but not in outbound)
   * 
   * These are SKUs that:
   * 1. Have stock in inventory
   * 2. Have NO matching delivery notes in outbound data
   * 
   * This helps identify dead stock or slow-moving items that may need attention.
   */
  async getZeroOrderProducts(
    warehouse?: string,
    productCategory?: string,
    minDaysInStock?: number,
    limit?: number,
  ): Promise<ZeroOrderProductsResponse> {
    const startTime = Date.now();

    // Get all processed inventory uploads
    const inventoryUploads = await this.prisma.inventoryUpload.findMany({
      where: { status: 'processed' },
      select: { id: true },
    });

    if (inventoryUploads.length === 0) {
      throw new NotFoundException('No processed inventory uploads found');
    }

    const inventoryUploadIds = inventoryUploads.map(u => u.id);

    // Get all processed outbound uploads
    const outboundUploads = await this.prisma.outboundUpload.findMany({
      where: { status: 'processed' },
      select: { id: true },
    });

    const outboundUploadIds = outboundUploads.map(u => u.id);

    // Build filters
    const params: any[] = [inventoryUploadIds];
    let paramIdx = 1;
    let warehouseFilter = '';
    let categoryFilter = '';

    if (warehouse && warehouse !== 'ALL') {
      paramIdx++;
      params.push(warehouse);
      warehouseFilter = ` AND ir.warehouse = $${paramIdx}`;
    }

    if (productCategory && productCategory !== 'ALL') {
      paramIdx++;
      params.push(productCategory);
      categoryFilter = ` AND ir.product_category::text = $${paramIdx}`;
    }

    // Minimum days in stock threshold (default: 7 days)
    const minDays = minDaysInStock || 7;

    // Result limit (default: 50)
    const resultLimit = limit || 50;
    paramIdx++;
    params.push(resultLimit);

    // Query to find inventory items that don't exist in outbound
    // We compare inventory items against outbound delivery_note_item
    let query: string;
    
    if (outboundUploadIds.length > 0) {
      // Add outbound upload IDs to params
      paramIdx++;
      params.push(outboundUploadIds);
      
      query = `
        WITH inventory_items AS (
          SELECT 
            ir.item,
            ir.warehouse,
            ir.item_group,
            ir.product_category::text as product_category,
            ir.cbm_per_unit,
            AVG(ids.quantity) as avg_stock_qty,
            COUNT(DISTINCT ids.stock_date) as days_in_stock,
            (AVG(ids.quantity) * ir.cbm_per_unit) as total_cbm
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            ${warehouseFilter}
            ${categoryFilter}
          GROUP BY ir.item, ir.warehouse, ir.item_group, ir.product_category, ir.cbm_per_unit
          HAVING AVG(ids.quantity) > 0
        ),
        outbound_items AS (
          SELECT DISTINCT delivery_note_item as item
          FROM outbound_rows
          WHERE upload_id = ANY($${paramIdx})
            AND delivery_note_item IS NOT NULL
            AND delivery_note_qty > 0
        ),
        latest_stock AS (
          SELECT DISTINCT ON (ir.item, ir.warehouse)
            ir.item,
            ir.warehouse,
            ids.quantity as latest_qty
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
          ORDER BY ir.item, ir.warehouse, ids.stock_date DESC
        )
        SELECT 
          ii.item,
          ii.warehouse,
          ii.item_group,
          ii.product_category,
          ii.avg_stock_qty,
          COALESCE(ls.latest_qty, 0) as latest_stock_qty,
          ii.cbm_per_unit,
          ii.total_cbm,
          ii.days_in_stock
        FROM inventory_items ii
        LEFT JOIN outbound_items oi ON LOWER(TRIM(ii.item)) = LOWER(TRIM(oi.item))
        LEFT JOIN latest_stock ls ON ls.item = ii.item AND ls.warehouse = ii.warehouse
        WHERE oi.item IS NULL
          AND ii.days_in_stock >= ${minDays}
        ORDER BY ii.total_cbm DESC
        LIMIT $${paramIdx - 1}
      `;
    } else {
      // No outbound data - all inventory items are "zero order"
      query = `
        WITH inventory_items AS (
          SELECT 
            ir.item,
            ir.warehouse,
            ir.item_group,
            ir.product_category::text as product_category,
            ir.cbm_per_unit,
            AVG(ids.quantity) as avg_stock_qty,
            COUNT(DISTINCT ids.stock_date) as days_in_stock,
            (AVG(ids.quantity) * ir.cbm_per_unit) as total_cbm
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
            AND LOWER(TRIM(ir.item)) != 'total'
            ${warehouseFilter}
            ${categoryFilter}
          GROUP BY ir.item, ir.warehouse, ir.item_group, ir.product_category, ir.cbm_per_unit
          HAVING AVG(ids.quantity) > 0
        ),
        latest_stock AS (
          SELECT DISTINCT ON (ir.item, ir.warehouse)
            ir.item,
            ir.warehouse,
            ids.quantity as latest_qty
          FROM inventory_rows ir
          INNER JOIN inventory_daily_stock ids ON ids.inventory_row_id = ir.id
          WHERE ir.upload_id = ANY($1)
            AND ir.is_total_row = false
          ORDER BY ir.item, ir.warehouse, ids.stock_date DESC
        )
        SELECT 
          ii.item,
          ii.warehouse,
          ii.item_group,
          ii.product_category,
          ii.avg_stock_qty,
          COALESCE(ls.latest_qty, 0) as latest_stock_qty,
          ii.cbm_per_unit,
          ii.total_cbm,
          ii.days_in_stock
        FROM inventory_items ii
        LEFT JOIN latest_stock ls ON ls.item = ii.item AND ls.warehouse = ii.warehouse
        WHERE ii.days_in_stock >= ${minDays}
        ORDER BY ii.total_cbm DESC
        LIMIT $${paramIdx}
      `;
    }

    const results = await this.prisma.$queryRawUnsafe<Array<{
      item: string;
      warehouse: string;
      item_group: string;
      product_category: string;
      avg_stock_qty: number;
      latest_stock_qty: number;
      cbm_per_unit: number;
      total_cbm: number;
      days_in_stock: number;
    }>>(query, ...params);

    // Process results and classify by CBM value
    const products: ZeroOrderProduct[] = results.map(row => {
      const totalCbm = Number(row.total_cbm) || 0;
      
      // Classify stock value based on CBM
      let stockValue: string;
      if (totalCbm >= 1) {
        stockValue = 'high';
      } else if (totalCbm >= 0.1) {
        stockValue = 'medium';
      } else {
        stockValue = 'low';
      }

      return {
        item: row.item,
        warehouse: row.warehouse,
        itemGroup: row.item_group,
        productCategory: row.product_category,
        avgStockQty: Math.round(Number(row.avg_stock_qty) * 100) / 100,
        latestStockQty: Math.round(Number(row.latest_stock_qty) * 100) / 100,
        cbmPerUnit: Math.round(Number(row.cbm_per_unit) * 10000) / 10000,
        totalCbm: Math.round(totalCbm * 100) / 100,
        daysInStock: Number(row.days_in_stock) || 0,
        stockValue,
      };
    });

    // Calculate summary
    const totalCbmBlocked = products.reduce((sum, p) => sum + p.totalCbm, 0);
    const summary = {
      totalZeroOrderProducts: products.length,
      highValueCount: products.filter(p => p.stockValue === 'high').length,
      mediumValueCount: products.filter(p => p.stockValue === 'medium').length,
      lowValueCount: products.filter(p => p.stockValue === 'low').length,
      totalCbmBlocked: Math.round(totalCbmBlocked * 100) / 100,
    };

    // Get available filters
    const [availableWarehouses, availableProductCategories] = await Promise.all([
      this.getAvailableWarehouses(inventoryUploadIds),
      this.getAvailableProductCategories(inventoryUploadIds),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`getZeroOrderProducts: ${elapsed}ms, found ${products.length} products`);

    return {
      products,
      summary,
      filters: {
        availableWarehouses,
        availableProductCategories: ['ALL', ...availableProductCategories],
      },
    };
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
