import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryNormalizerService } from '../outbound/category-normalizer.service';
import { ProductCategory } from '@prisma/client';
import * as XLSX from 'xlsx-js-style';
import * as fs from 'fs';
import * as path from 'path';
import { formatDateAsISO } from '../common/utils/date-utils';

export interface ItemMasterUploadResult {
  uploadId: string;
  rowsProcessed: number;
  message: string;
}

export interface InboundUploadResult {
  uploadId: string;
  rowsInserted: number;
}

export interface InboundCardMetrics {
  invoiceSkuCount: number;
  receivedSkuCount: number;
  invoiceQtyTotal: number;
  receivedQtyTotal: number;
  goodQtyTotal: number;
  totalCbm: number;
  vehicleCount: number;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  edelReceivedQty: number;
  receivedQty: number;
  totalCbm: number;
  edelTotalCbm: number;
  startDate: string;
  endDate: string;
}

export interface TimeSeriesData {
  granularity: 'month' | 'week' | 'day';
  points: TimeSeriesPoint[];
}

export interface DayData {
  date: string;
  label: string;
  receivedQty: number;
  totalCbm: number;
  edelReceivedQty: number;
  edelTotalCbm: number;
}

export interface SummaryTotals {
  totalReceivedQty: number;
  totalCbm: number;
  totalEdelReceivedQty: number;
  totalEdelTotalCbm: number;
  dayData: DayData[];
}

export interface ProductCategoryTableRow {
  category: string;
  skuCount: number;
  receivedQty: number;
  totalCbm: number;
}

export interface UploadInfo {
  uploadId: string;
  fileName: string;
  uploadedAt: Date;
  rowsInserted: number;
  status: string;
  type: 'item-master' | 'inbound';
}

export interface InboundSummaryResponse {
  cards: InboundCardMetrics;
  availableDates: {
    minDate: string | null;
    maxDate: string | null;
  };
  availableMonths: string[];
  productCategories: string[];
  timeSeries: TimeSeriesData;
  summaryTotals: SummaryTotals;
  categoryTable: ProductCategoryTableRow[];
}

// Path to the static Item Master file - configurable via environment variable
const ITEM_MASTER_PATH = process.env.ITEM_MASTER_PATH || path.resolve(__dirname, '../../Item master.xlsx');

@Injectable()
export class InboundService implements OnModuleInit {
  private cache = new Map<string, InboundSummaryResponse>();

  constructor(
    private prisma: PrismaService,
    private categoryNormalizer: CategoryNormalizerService,
  ) { }

  /**
   * Auto-load Item Master on module initialization
   */
  async onModuleInit() {
    await this.loadItemMasterFromFile();
  }

  /**
   * Load Item Master from the static file if it exists and DB is empty
   */
  private async loadItemMasterFromFile(): Promise<void> {
    try {
      // Check if Item Master file exists
      if (!fs.existsSync(ITEM_MASTER_PATH)) {
        return;
      }

      // Check if Item Master table already has data
      const existingCount = await this.prisma.itemMaster.count();
      if (existingCount > 0) {
        return;
      }

      await this.loadItemMasterInternal(ITEM_MASTER_PATH, false);
    } catch (error) {
      const message = this.getErrorMessage(error);
      console.error('Failed to auto-load Item Master:', error, message);
    }
  }

  /**
   * Internal method to load Item Master (shared by auto-load and upload)
   * @param filePath - Path to the Excel file
   * @param deleteFile - Whether to delete the file after processing
   */
  private async loadItemMasterInternal(filePath: string, deleteFile: boolean): Promise<ItemMasterUploadResult> {
    const startTime = Date.now();

    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Skip header row (index 0), start from row 2
    const dataRows = rawData.slice(1);

    // Parse all rows into a batch
    const itemMasterRecords: Array<{ id: string; itemGroup: string; cbmPerUnit: number }> = [];

    for (const row of dataRows) {
      // Skip empty rows
      if (!row || row.length === 0) continue;

      // Excel columns (0-indexed):
      // ID=column B (1), Item Group=column D (3), CBM=column H (7)
      const id = this.getCellValue(row[1]); // B
      const itemGroup = this.getCellValue(row[3]); // D
      const cbmPerUnit = this.parseNumber(row[7]); // H

      if (!id) continue; // Skip rows without ID

      itemMasterRecords.push({
        id,
        itemGroup: itemGroup || 'Others',
        cbmPerUnit: cbmPerUnit || 0,
      });
    }

    if (itemMasterRecords.length === 0) {
      if (deleteFile) fs.unlinkSync(filePath);
      return { uploadId: 'item-master-' + Date.now(), rowsProcessed: 0, message: 'No data found' };
    }

    // Batch upsert using raw SQL with ON CONFLICT DO UPDATE
    const BATCH_SIZE = 1000;

    // Remove duplicates
    const uniqueRecords = Array.from(
      new Map(itemMasterRecords.map(record => [record.id, record])).values()
    );

    for (let i = 0; i < uniqueRecords.length; i += BATCH_SIZE) {
      const batch = uniqueRecords.slice(i, i + BATCH_SIZE);

      const values = batch.map((_, idx) => {
        const offset = idx * 3;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      }).join(', ');

      const params = batch.flatMap(r => [r.id, r.itemGroup, r.cbmPerUnit]);

      await this.prisma.$executeRawUnsafe(`
        INSERT INTO item_master (id, item_group, cbm_per_unit)
        VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
          item_group = EXCLUDED.item_group,
          cbm_per_unit = EXCLUDED.cbm_per_unit
      `, ...params);
    }

    if (deleteFile) fs.unlinkSync(filePath);

    // Clear cache
    this.cache.clear();

    const elapsed = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`ItemMaster loaded: ${uniqueRecords.length} rows in ${elapsed}ms`);
    }

    return {
      uploadId: 'item-master-' + Date.now(),
      rowsProcessed: uniqueRecords.length,
      message: 'Item Master processed successfully',
    };
  }

  /**
   * Get all uploads (both item-master and inbound)
   */
  async getUploads(): Promise<UploadInfo[]> {
    const inboundUploads = await this.prisma.inboundUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: { _count: { select: { rows: true } } },
    });

    return inboundUploads.map(upload => ({
      uploadId: upload.id,
      fileName: upload.fileName,
      uploadedAt: upload.uploadedAt,
      rowsInserted: upload._count.rows,
      status: upload.status,
      type: 'inbound' as const,
    }));
  }

  /**
   * Delete an inbound upload and all associated data
   */
  async deleteUpload(uploadId: string): Promise<void> {
    // Check if upload exists
    const upload = await this.prisma.inboundUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) {
      throw new NotFoundException(`Inbound upload with ID ${uploadId} not found`);
    }

    // Delete the upload (cascade will delete rows)
    await this.prisma.inboundUpload.delete({
      where: { id: uploadId },
    });

    // Clear cache
    this.cache.clear();
  }

  /**
   * Parse and store Item Master Excel file (manual upload)
   * Delegates to internal method with deleteFile=true
   */
  async uploadItemMaster(filePath: string, fileName?: string): Promise<ItemMasterUploadResult> {
    try {
      return await this.loadItemMasterInternal(filePath, true);
    } catch (error) {
      console.error('Error processing Item Master Excel file:', error);
      const message = this.getErrorMessage(error);
      throw new Error(`Failed to process Item Master Excel file: ${message}`);
    }
  }

  // Maximum rows to process (prevent DoS from huge files)
  private static readonly MAX_ROWS = 500000;
  private static readonly BATCH_SIZE = 5000;

  /**
   * Parse and store Inbound Excel file
   * 
   * SECURITY: Uses transaction to ensure atomicity
   * SECURITY: Enforces row limit to prevent DoS
   * SECURITY: Ensures temp file cleanup in all cases
   */
  async uploadInbound(filePath: string, fileName: string): Promise<InboundUploadResult> {
    const startTime = Date.now();

    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip row 1 (blank), row 2 has headers, data starts at row 3
      const dataRows = rawData.slice(2);

      // Security: Enforce row limit
      if (dataRows.length > InboundService.MAX_ROWS) {
        throw new Error(`File exceeds maximum allowed rows (${InboundService.MAX_ROWS}). Please split the file.`);
      }

      // Build item master map for CBM lookup (before transaction)
      const itemMasterMap = new Map<string, { itemGroup: string; cbmPerUnit: number }>();
      const itemMasters = await this.prisma.itemMaster.findMany({
        select: { id: true, itemGroup: true, cbmPerUnit: true },
      });

      itemMasters.forEach((master) => {
        itemMasterMap.set(master.id, {
          itemGroup: master.itemGroup || 'Others',
          cbmPerUnit: master.cbmPerUnit || 0,
        });
      });

      // Parse all rows first (before transaction) to catch validation errors early
      const parsedRows: Array<{
        srNo: string | null;
        dateOfUnload: Date | null;
        invoiceSku: string | null;
        receivedSku: string | null;
        invoiceQty: number;
        receivedQty: number;
        goodQty: number;
        itemGroup: string;
        cbmPerUnit: number;
        totalCbm: number;
        productCategory: ProductCategory;
      }> = [];

      for (const row of dataRows) {
        // Skip empty rows
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        // Excel columns (0-indexed):
        // Sr No.=column A (0), Date of Unload=column B (1), Invoice SKU=column I (8), Received SKU=column J (9)
        // Invoice Qty=column K (10), Received Qty=column L (11), Good=column N (13)
        const srNo = this.getCellValue(row[0]); // A
        const dateOfUnload = this.parseExcelDate(row[1]); // B
        const invoiceSku = this.getCellValue(row[8]); // I
        const receivedSku = this.getCellValue(row[9]); // J
        const invoiceQty = this.parseNumber(row[10]); // K
        const receivedQty = this.parseNumber(row[11]); // L
        const goodQty = this.parseNumber(row[13]); // N

        // CBM and Item Group join logic
        let itemGroup = 'Others';
        let cbmPerUnit = 0;
        let totalCbm = 0;

        const receivedSkuTrimmed = receivedSku?.trim();
        if (receivedSkuTrimmed && itemMasterMap.has(receivedSkuTrimmed)) {
          const master = itemMasterMap.get(receivedSkuTrimmed);
          if (master) {
            cbmPerUnit = master.cbmPerUnit || 0;
            itemGroup = master.itemGroup || 'Others';
          }
        }

        totalCbm = receivedQty * cbmPerUnit;

        const productCategory = this.categoryNormalizer.normalizeProductCategory(itemGroup);

        parsedRows.push({
          srNo,
          dateOfUnload,
          invoiceSku,
          receivedSku,
          invoiceQty,
          receivedQty,
          goodQty,
          itemGroup,
          cbmPerUnit,
          totalCbm,
          productCategory,
        });
      }

      if (parsedRows.length === 0) {
        throw new Error('No valid data rows found in the Excel file');
      }

      // Use transaction to ensure atomicity
      // Increase timeout to 2 minutes for large files
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Create upload record within transaction
          const upload = await tx.inboundUpload.create({
            data: {
              fileName,
              status: 'processing',
            },
          });

          // Bulk insert rows in batches
          const rowsWithUploadId = parsedRows.map(row => ({
            ...row,
            uploadId: upload.id,
          }));

          for (let i = 0; i < rowsWithUploadId.length; i += InboundService.BATCH_SIZE) {
            const batch = rowsWithUploadId.slice(i, i + InboundService.BATCH_SIZE);
            await tx.inboundRow.createMany({
              data: batch,
            });
          }

          // Mark upload as processed
          await tx.inboundUpload.update({
            where: { id: upload.id },
            data: { status: 'processed' },
          });

          return {
            uploadId: upload.id,
            rowsInserted: parsedRows.length,
          };
        },
        {
          maxWait: 120000, // 2 minutes max wait to acquire connection
          timeout: 120000, // 2 minutes transaction timeout
        }
      );

      // Clear cache when new data is uploaded
      this.cache.clear();

      const elapsed = Date.now() - startTime;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Inbound upload: ${result.rowsInserted} rows in ${elapsed}ms`);
      }

      return result;
    } catch (error) {
      console.error('Error processing Inbound Excel file:', error);
      const message = this.getErrorMessage(error);
      throw new Error(`Failed to process Inbound Excel file: ${message}`);
    } finally {
      // SECURITY: Always clean up temp file
      this.safeUnlink(filePath);
    }
  }

  /**
   * Safely delete a file, logging but not throwing on error
   */
  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Failed to delete temp file ${filePath}:`, err);
    }
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
   * Get inbound summary data with filters
   * 
   * OPTIMIZATION: Use SQL aggregation instead of fetching all rows
   * Previous: Fetch ALL rows, aggregate in TypeScript
   * After: Use SQL aggregate + count(distinct) queries
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategories?: string[],
    timeGranularity?: 'month' | 'week' | 'day',
  ): Promise<InboundSummaryResponse> {
    const startTime = Date.now();

    // Generate cache key
    // 'all' when no uploadId specified = aggregate across all uploads
    const granularity = timeGranularity || 'month';
    const cacheKey = `${uploadId || 'all'}-${fromDate || ''}-${toDate || ''}-${month || ''}-${(productCategories || []).sort().join(',') || 'ALL'}-${granularity}`;

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
      const allUploads = await this.prisma.inboundUpload.findMany({
        where: { status: 'processed' },
        select: { id: true },
      });

      if (allUploads.length === 0) {
        throw new NotFoundException('No processed inbound uploads found');
      }

      targetUploadIds = allUploads.map(u => u.id);
    }

    // Handle month filter - convert to fromDate/toDate
    let effectiveFromDate = fromDate;
    let effectiveToDate = toDate;
    if (month && month !== 'ALL') {
      const [year, monthNum] = month.split('-').map(Number);
      effectiveFromDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      effectiveToDate = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
    }

    // Filter out 'ALL' from categories
    const productCategoryFilter = productCategories && productCategories.length > 0
      ? productCategories.filter(c => c !== 'ALL')
      : undefined;

    // Run parallel queries for metrics, dates, months, categories, time series, and category table
    // (aggregating across all uploads if multiple)
    const [cards, availableDates, availableMonths, productCategoriesList, timeSeries, summaryTotals, categoryTable] = await Promise.all([
      this.calculateCardMetricsOptimized(targetUploadIds, effectiveFromDate, effectiveToDate, productCategoryFilter),
      this.getAvailableDates(targetUploadIds),
      this.getAvailableMonths(targetUploadIds),
      this.getProductCategories(targetUploadIds),
      this.generateTimeSeries(targetUploadIds, effectiveFromDate, effectiveToDate, productCategoryFilter, granularity),
      this.getSummaryTotals(targetUploadIds, effectiveFromDate, effectiveToDate, productCategoryFilter),
      this.getProductCategoryTable(targetUploadIds, effectiveFromDate, effectiveToDate, productCategoryFilter),
    ]);

    const result: InboundSummaryResponse = {
      cards,
      availableDates,
      availableMonths: ['ALL', ...availableMonths],
      productCategories: ['ALL', ...productCategoriesList],
      timeSeries,
      summaryTotals,
      categoryTable,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Inbound getSummary: ${elapsed}ms`);
    }

    return result;
  }

  /**
   * Helper to parse date string as local date (not UTC)
   * Fixes timezone issue where "2024-11-01" was being parsed as UTC midnight
   */
  private parseLocalDate(dateStr: string, endOfDay = false): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (endOfDay) {
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  /**
   * OPTIMIZATION: Calculate card metrics using SQL aggregation
   * Reduces data transfer from N rows to a single aggregated result
   * Supports multiple upload IDs for aggregating across all uploads
   */
  private async calculateCardMetricsOptimized(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
  ): Promise<InboundCardMetrics> {
    // Build date filter
    let dateCondition = '';
    const params: any[] = [uploadIds];

    if (fromDate) {
      params.push(this.parseLocalDate(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(this.parseLocalDate(toDate, true));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }

    // Single query with all aggregations
    const result = await this.prisma.$queryRawUnsafe<[{
      invoice_sku_count: bigint;
      received_sku_count: bigint;
      invoice_qty_total: number;
      received_qty_total: number;
      good_qty_total: number;
      total_cbm: number;
      vehicle_count: bigint;
    }]>(`
      SELECT 
        COUNT(DISTINCT invoice_sku) as invoice_sku_count,
        COUNT(DISTINCT received_sku) as received_sku_count,
        COALESCE(SUM(invoice_qty), 0) as invoice_qty_total,
        COALESCE(SUM(received_qty), 0) as received_qty_total,
        COALESCE(SUM(good_qty), 0) as good_qty_total,
        COALESCE(SUM(total_cbm), 0) as total_cbm,
        COUNT(DISTINCT sr_no) as vehicle_count
      FROM inbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
    `, ...params);

    const row = result[0];
    return {
      invoiceSkuCount: Number(row?.invoice_sku_count || 0),
      receivedSkuCount: Number(row?.received_sku_count || 0),
      invoiceQtyTotal: Math.round(Number(row?.invoice_qty_total || 0) * 100) / 100,
      receivedQtyTotal: Math.round(Number(row?.received_qty_total || 0) * 100) / 100,
      goodQtyTotal: Math.round(Number(row?.good_qty_total || 0) * 100) / 100,
      totalCbm: Math.round(Number(row?.total_cbm || 0) * 100) / 100,
      vehicleCount: Number(row?.vehicle_count || 0),
    };
  }

  private async getAvailableDates(uploadIds: string[]): Promise<{ minDate: string | null; maxDate: string | null }> {
    const result = await this.prisma.inboundRow.aggregate({
      where: { uploadId: { in: uploadIds } },
      _min: { dateOfUnload: true },
      _max: { dateOfUnload: true },
    });

    return {
      minDate: result._min.dateOfUnload ? formatDateAsISO(result._min.dateOfUnload) : null,
      maxDate: result._max.dateOfUnload ? formatDateAsISO(result._max.dateOfUnload) : null,
    };
  }

  /**
   * OPTIMIZATION: Get available months using SQL date extraction
   * Previous: Fetch all distinct dates, process in JS
   * After: Use SQL date_trunc/extract for direct month aggregation
   */
  private async getAvailableMonths(uploadIds: string[]): Promise<string[]> {
    const result = await this.prisma.$queryRawUnsafe<Array<{ month_str: string }>>(`
      SELECT DISTINCT 
        TO_CHAR(date_of_unload, 'YYYY-MM') as month_str
      FROM inbound_rows
      WHERE upload_id = ANY($1)
        AND date_of_unload IS NOT NULL
      ORDER BY month_str
    `, uploadIds);

    return result.map(r => r.month_str).filter(Boolean);
  }

  private async getProductCategories(uploadIds: string[]): Promise<string[]> {
    const rows = await this.prisma.inboundRow.findMany({
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
   * OPTIMIZATION: Generate time series using SQL aggregation
   * Previous: Fetch ALL rows into memory, process in JavaScript
   * After: Use SQL GROUP BY for direct aggregation in PostgreSQL
   * This dramatically improves performance for large datasets
   */
  private async generateTimeSeries(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
    granularity: 'month' | 'week' | 'day' = 'month',
  ): Promise<TimeSeriesData> {
    // Build parameterized query
    const params: any[] = [uploadIds];
    let dateCondition = '';
    let categoryCondition = '';

    if (fromDate) {
      params.push(this.parseLocalDate(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(this.parseLocalDate(toDate, true));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      categoryCondition = ` AND product_category IN (${placeholders})`;
    }

    // Dynamic SQL based on granularity
    let groupByExpr: string;
    let periodExpr: string;

    switch (granularity) {
      case 'day':
        groupByExpr = `DATE(date_of_unload)`;
        periodExpr = `TO_CHAR(DATE(date_of_unload), 'YYYY-MM-DD')`;
        break;
      case 'week':
        groupByExpr = `DATE_TRUNC('week', date_of_unload)`;
        periodExpr = `TO_CHAR(DATE_TRUNC('week', date_of_unload), 'IYYY-IW')`;
        break;
      case 'month':
      default:
        groupByExpr = `DATE_TRUNC('month', date_of_unload)`;
        periodExpr = `TO_CHAR(DATE_TRUNC('month', date_of_unload), 'YYYY-MM')`;
        break;
    }

    // Single optimized SQL query with all aggregations
    const results = await this.prisma.$queryRawUnsafe<Array<{
      period: Date;
      period_label: string;
      received_qty: number;
      total_cbm: number;
      edel_received_qty: number;
      edel_total_cbm: number;
    }>>(`
      SELECT 
        ${groupByExpr} as period,
        ${periodExpr} as period_label,
        COALESCE(SUM(received_qty), 0) as received_qty,
        COALESCE(SUM(total_cbm), 0) as total_cbm,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN received_qty ELSE 0 END), 0) as edel_received_qty,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN total_cbm ELSE 0 END), 0) as edel_total_cbm
      FROM inbound_rows
      WHERE upload_id = ANY($1)
        AND date_of_unload IS NOT NULL
        ${dateCondition}
        ${categoryCondition}
      GROUP BY ${groupByExpr}
      ORDER BY period
    `, ...params);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const points: TimeSeriesPoint[] = results.map(row => {
      const period = new Date(row.period);
      let label: string;
      let startDate: string;
      let endDate: string;

      switch (granularity) {
        case 'day':
          startDate = formatDateAsISO(period);
          endDate = startDate;
          label = `${period.getDate()} ${monthNames[period.getMonth()]}`;
          break;
        case 'week':
          startDate = formatDateAsISO(period);
          const weekEnd = new Date(period);
          weekEnd.setDate(weekEnd.getDate() + 6);
          endDate = formatDateAsISO(weekEnd);

          // Calculate week number within the month for label
          const weekMonth = period.getMonth();
          const firstDayOfMonth = new Date(period.getFullYear(), weekMonth, 1);
          const weekOfMonth = Math.ceil((period.getDate() + firstDayOfMonth.getDay()) / 7);

          label = `Week${weekOfMonth}'${monthNames[weekMonth]}`;
          break;
        case 'month':
        default:
          startDate = formatDateAsISO(period);
          const monthEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0);
          endDate = formatDateAsISO(monthEnd);
          label = `${monthNames[period.getMonth()]}'${period.getFullYear().toString().slice(-2)}`;
          break;
      }

      return {
        key: row.period_label,
        label,
        edelReceivedQty: Math.round(Number(row.edel_received_qty) * 100) / 100,
        receivedQty: Math.round(Number(row.received_qty) * 100) / 100,
        totalCbm: Math.round(Number(row.total_cbm) * 100) / 100,
        edelTotalCbm: Math.round(Number(row.edel_total_cbm) * 100) / 100,
        startDate,
        endDate,
      };
    });

    return { granularity, points };
  }

  private async getSummaryTotals(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
  ): Promise<SummaryTotals> {
    // Build SQL conditions similar to outbound summary totals
    let dateCondition = '';
    const params: any[] = [uploadIds];

    if (fromDate) {
      params.push(this.parseLocalDate(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(this.parseLocalDate(toDate, true));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }

    // Get day-by-day breakdown using a single aggregated query
    const dayResults = await this.prisma.$queryRawUnsafe<Array<{
      day_date: Date;
      day_label: string;
      received_qty: number;
      total_cbm: number;
      edel_received_qty: number;
      edel_total_cbm: number;
    }>>(`
      SELECT 
        DATE(date_of_unload + INTERVAL '5 hours 30 minutes') as day_date,
        TO_CHAR(date_of_unload + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD') as day_label,
        COALESCE(SUM(received_qty), 0) as received_qty,
        COALESCE(SUM(total_cbm), 0) as total_cbm,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN received_qty ELSE 0 END), 0) as edel_received_qty,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN total_cbm ELSE 0 END), 0) as edel_total_cbm
      FROM inbound_rows
      WHERE upload_id = ANY($1)
        AND date_of_unload IS NOT NULL
        ${dateCondition}
      GROUP BY DATE(date_of_unload + INTERVAL '5 hours 30 minutes'), TO_CHAR(date_of_unload + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD')
      ORDER BY day_date
    `, ...params);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayData: DayData[] = dayResults.map(row => {
      const date = new Date(row.day_label);
      return {
        date: row.day_label,
        label: `${date.getDate()} ${monthNames[date.getMonth()]}`,
        receivedQty: Math.round(Number(row.received_qty) * 100) / 100,
        totalCbm: Math.round(Number(row.total_cbm) * 100) / 100,
        edelReceivedQty: Math.round(Number(row.edel_received_qty) * 100) / 100,
        edelTotalCbm: Math.round(Number(row.edel_total_cbm) * 100) / 100,
      };
    });

    const totalReceivedQty = dayData.reduce((sum, d) => sum + d.receivedQty, 0);
    const totalCbm = dayData.reduce((sum, d) => sum + d.totalCbm, 0);
    const totalEdelReceivedQty = dayData.reduce((sum, d) => sum + d.edelReceivedQty, 0);
    const totalEdelTotalCbm = dayData.reduce((sum, d) => sum + d.edelTotalCbm, 0);

    return {
      totalReceivedQty: Math.round(totalReceivedQty * 100) / 100,
      totalCbm: Math.round(totalCbm * 100) / 100,
      totalEdelReceivedQty: Math.round(totalEdelReceivedQty * 100) / 100,
      totalEdelTotalCbm: Math.round(totalEdelTotalCbm * 100) / 100,
      dayData,
    };
  }

  /**
   * Get product category table data
   * Aggregates SKU count, received qty, and total CBM by product category
   */
  private async getProductCategoryTable(
    uploadIds: string[],
    fromDate?: string,
    toDate?: string,
    productCategories?: string[],
  ): Promise<ProductCategoryTableRow[]> {
    // Build SQL conditions
    let dateCondition = '';
    const params: any[] = [uploadIds];

    if (fromDate) {
      params.push(this.parseLocalDate(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(this.parseLocalDate(toDate, true));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategories && productCategories.length > 0) {
      const placeholders = productCategories.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategories);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }

    // Query to aggregate by product category
    const results = await this.prisma.$queryRawUnsafe<Array<{
      product_category: string;
      sku_count: bigint;
      received_qty: number;
      total_cbm: number;
    }>>(`
      SELECT 
        product_category,
        COUNT(DISTINCT received_sku) as sku_count,
        COALESCE(SUM(received_qty), 0) as received_qty,
        COALESCE(SUM(total_cbm), 0) as total_cbm
      FROM inbound_rows
      WHERE upload_id = ANY($1)
        AND product_category IS NOT NULL
        ${dateCondition}
      GROUP BY product_category
      ORDER BY product_category
    `, ...params);

    return results.map(row => ({
      category: row.product_category,
      skuCount: Number(row.sku_count || 0),
      receivedQty: Math.round(Number(row.received_qty || 0) * 100) / 100,
      totalCbm: Math.round(Number(row.total_cbm || 0) * 100) / 100,
    }));
  }

  /**
   * Generate inbound summary Excel export
   */
  async generateSummaryExcel(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategories?: string[],
    timeGranularity: 'month' | 'week' | 'day' = 'month',
  ): Promise<Buffer> {
    // Reuse existing summary pipeline (month filter handled inside getSummary)
    const summary = await this.getSummary(
      uploadId,
      fromDate,
      toDate,
      month,
      productCategories,
      timeGranularity,
    );

    const workbook = XLSX.utils.book_new();

    const createStyledSheet = (
      sheetName: string,
      header: string[],
      rows: Array<Array<string | number>>,
      totalsRow?: Array<string | number>,
    ) => {
      const data = [header, ...rows];
      if (totalsRow) {
        data.push(totalsRow);
      }

      const sheet = XLSX.utils.aoa_to_sheet(data);

      // Auto-fit columns based on content length (minimum width = 12)
      const colWidths = header.map((_, colIdx) => {
        const maxLen = data.reduce((max, row) => {
          const cell = row[colIdx];
          const len = String(cell ?? '').length;
          return Math.max(max, len);
        }, header[colIdx].length);
        return { wch: Math.max(12, maxLen + 2) };
      });
      sheet['!cols'] = colWidths;

      // Apply simple table styling: header fill + bold, borders, totals row highlight
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          if (!cell) continue;

          const style: any = cell.s || {};
          style.border = {
            top: { style: 'thin', color: { rgb: 'D1D5DB' } },
            bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
            left: { style: 'thin', color: { rgb: 'D1D5DB' } },
            right: { style: 'thin', color: { rgb: 'D1D5DB' } },
          };

          if (r === 0) {
            style.font = { ...(style.font || {}), bold: true, color: { rgb: '111827' } };
            style.fill = { fgColor: { rgb: 'E5E7EB' } };
            style.alignment = { horizontal: 'center', vertical: 'center' };
          } else if (totalsRow && r === data.length - 1) {
            style.font = { ...(style.font || {}), bold: true };
            style.fill = { fgColor: { rgb: 'FEF3C7' } };
            style.alignment = { horizontal: 'center', vertical: 'center' };
          } else {
            style.alignment = { horizontal: 'left', vertical: 'center' };
          }

          sheet[cellRef] = { ...cell, s: style } as XLSX.CellObject;
        }
      }

      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    };

    // Sheet 1: Summary cards
    const cardRows: Array<Array<string | number>> = [
      ['Invoice SKU Count', summary.cards.invoiceSkuCount],
      ['Received SKU Count', summary.cards.receivedSkuCount],
      ['Invoice Qty Total', summary.cards.invoiceQtyTotal],
      ['Received Qty Total', summary.cards.receivedQtyTotal],
      ['Good Qty Total', summary.cards.goodQtyTotal],
      ['Total CBM', summary.cards.totalCbm],
    ];
    createStyledSheet('Summary Cards', ['Metric', 'Value'], cardRows);

    // Sheet 2: Chart data (time series)
    const chartHeader = ['Label', 'Start Date', 'End Date', 'Received Qty', 'Total CBM', 'EDEL Received Qty', 'EDEL CBM'];
    const chartRows = (summary.timeSeries?.points || []).map((p) => [
      p.label,
      p.startDate,
      p.endDate,
      Math.round((p.receivedQty || 0) * 100) / 100,
      Math.round((p.totalCbm || 0) * 100) / 100,
      Math.round((p.edelReceivedQty || 0) * 100) / 100,
      Math.round((p.edelTotalCbm || 0) * 100) / 100,
    ]);
    const chartTotals = chartRows.length
      ? [
        'Total',
        '',
        '',
        chartRows.reduce((sum, row) => sum + (Number(row[3]) || 0), 0),
        chartRows.reduce((sum, row) => sum + (Number(row[4]) || 0), 0),
        chartRows.reduce((sum, row) => sum + (Number(row[5]) || 0), 0),
        chartRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0),
      ]
      : undefined;
    createStyledSheet('Chart Data', chartHeader, chartRows, chartTotals);

    // Sheet 3: Summary totals (daily breakdown + totals row)
    const totals = summary.summaryTotals;
    const dayHeader = ['Date', 'Received Qty', 'Total CBM', 'EDEL Received Qty', 'EDEL CBM'];
    const dayRows = (totals.dayData || []).map((d) => [
      d.date,
      Math.round((d.receivedQty || 0) * 100) / 100,
      Math.round((d.totalCbm || 0) * 100) / 100,
      Math.round((d.edelReceivedQty || 0) * 100) / 100,
      Math.round((d.edelTotalCbm || 0) * 100) / 100,
    ]);
    const dayTotalsRow = [
      'Total',
      Math.round((totals.totalReceivedQty || 0) * 100) / 100,
      Math.round((totals.totalCbm || 0) * 100) / 100,
      Math.round((totals.totalEdelReceivedQty || 0) * 100) / 100,
      Math.round((totals.totalEdelTotalCbm || 0) * 100) / 100,
    ];
    createStyledSheet('Summary Totals', dayHeader, dayRows, dayTotalsRow);

    // Sheet 4: Product Category Table
    const categoryHeader = ['Category', 'SKU Count', 'Received Qty', 'Total CBM'];
    const categoryRows = (summary.categoryTable || []).map((row) => [
      row.category,
      row.skuCount,
      Math.round((row.receivedQty || 0) * 100) / 100,
      Math.round((row.totalCbm || 0) * 100) / 100,
    ]);
    const categoryTotalsRow = categoryRows.length
      ? [
        'Total',
        categoryRows.reduce((sum, row) => sum + (Number(row[1]) || 0), 0),
        categoryRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0),
        categoryRows.reduce((sum, row) => sum + (Number(row[3]) || 0), 0),
      ]
      : undefined;
    createStyledSheet('Product Category', categoryHeader, categoryRows, categoryTotalsRow);

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  private getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private getWeekStart(year: number, week: number): Date {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - firstDayOfYear.getDay();
    return new Date(year, 0, 1 + daysOffset);
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

  /**
   * Parse Excel date - handles both serial numbers and string formats
   * 
   * BUGFIX: Excel uses 1899-12-30 as epoch (day 0), not 1899-11-30
   * Excel also has a leap year bug where it thinks 1900 was a leap year.
   */
  private parseExcelDate(cell: unknown): Date | null {
    if (cell === undefined || cell === null || cell === '') return null;

    try {
      // Handle Excel serial date numbers
      if (typeof cell === 'number') {
        const serialNumber = Math.floor(cell);

        if (serialNumber < 1) return null;
        if (serialNumber > 2958465) return null; // Beyond year 9999

        // Adjust for Excel's leap year bug
        const adjustedSerial = serialNumber >= 60 ? serialNumber - 1 : serialNumber;
        const date = new Date(1899, 11, 31 + adjustedSerial);

        // Handle time component
        const timeFraction = cell - serialNumber;
        if (timeFraction > 0) {
          const milliseconds = Math.round(timeFraction * 24 * 60 * 60 * 1000);
          date.setMilliseconds(date.getMilliseconds() + milliseconds);
        }

        return isNaN(date.getTime()) ? null : date;
      }

      // Handle string dates
      if (typeof cell === 'string') {
        const trimmed = cell.trim();
        if (!trimmed) return null;

        // Try ISO format first
        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const [, year, month, day] = isoMatch;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return isNaN(date.getTime()) ? null : date;
        }

        // Try DD/MM/YYYY format
        const dateMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dateMatch) {
          const [, part1, part2, yearPart] = dateMatch;
          const year = parseInt(yearPart) < 100 ? 2000 + parseInt(yearPart) : parseInt(yearPart);
          const day = parseInt(part1);
          const month = parseInt(part2) - 1;
          const date = new Date(year, month, day);
          return isNaN(date.getTime()) ? null : date;
        }

        // Fallback
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date;
      }

      if (cell instanceof Date) {
        return isNaN(cell.getTime()) ? null : cell;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * @deprecated Use parseExcelDate instead
   */
  private parseDate(cell: unknown): Date | null {
    return this.parseExcelDate(cell);
  }
}
