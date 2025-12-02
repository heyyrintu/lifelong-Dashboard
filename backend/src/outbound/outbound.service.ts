import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryNormalizerService } from './category-normalizer.service';
import { NormalizedCategory, ProductCategory } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export interface UploadResult {
  uploadId: string;
  rowsInserted: number;
}

export interface CardMetrics {
  soSku: number;
  soQty: number;
  soTotalCbm: number;
  dnSku: number;
  dnQty: number;
  dnTotalCbm: number;
  soMinusDnQty: number;
}

export interface CategoryRow {
  categoryLabel: string;
  soCount: number;
  soQty: number;
  soTotalCbm: number;
  dnCount: number;
  dnQty: number;
  dnTotalCbm: number;
  soMinusDnQty: number;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  soQty: number;
  soTotalCbm: number;
  dnQty: number;
  dnTotalCbm: number;
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
  dnQty: number;
  dnCbm: number;
  edelDnQty: number;
  edelDnCbm: number;
}

export interface SummaryTotals {
  totalDnQty: number;
  totalDnCbm: number;
  totalEdelDnQty: number;
  totalEdelDnCbm: number;
  dayData: DayData[];
}

export interface SummaryResponse {
  cards: CardMetrics;
  categoryTable: CategoryRow[];
  productCategoryTable: CategoryRow[];
  availableMonths: string[];
  productCategories: string[];
  availableWarehouses: string[];
  timeSeries: TimeSeriesData;
  summaryTotals: SummaryTotals;
}

export interface TopProduct {
  rank: number;
  deliveryNoteItem: string;
  totalCbm: number;
  totalQty: number;
  productCategory: string;
  percentageOfTotal: number;
}

@Injectable()
export class OutboundService {
  // Simple in-memory cache
  // TODO: Move to Redis in production
  private cache = new Map<string, SummaryResponse>();

  constructor(
    private prisma: PrismaService,
    private categoryNormalizer: CategoryNormalizerService,
  ) {}

  // Maximum rows to process (prevent DoS from huge files)
  private static readonly MAX_ROWS = 500000;
  private static readonly BATCH_SIZE = 5000;

  /**
   * Parse and store Excel file data
   * 
   * SECURITY: Uses transaction to ensure atomicity
   * SECURITY: Enforces row limit to prevent DoS
   * SECURITY: Ensures temp file cleanup in all cases
   */
  async uploadExcel(filePath: string, fileName: string): Promise<UploadResult> {
    const startTime = Date.now();
    
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip header row (index 0)
      const dataRows = rawData.slice(1);

      // Security: Enforce row limit
      if (dataRows.length > OutboundService.MAX_ROWS) {
        throw new Error(`File exceeds maximum allowed rows (${OutboundService.MAX_ROWS}). Please split the file.`);
      }

      // Parse all rows first (before transaction) to catch validation errors early
      const parsedRows: Array<{
        customerGroup: string | null;
        sourceWarehouse: string | null;
        soItem: string | null;
        categoryRaw: string | null;
        salesOrderQty: number;
        soTotalCbm: number;
        deliveryNoteDate: Date | null;
        deliveryNoteItem: string | null;
        deliveryNoteQty: number;
        dnTotalCbm: number;
        transporter: string | null;
        normalizedCategory: NormalizedCategory;
        productCategory: ProductCategory;
      }> = [];

      for (const row of dataRows) {
        // Skip empty rows
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        // Excel columns (0-indexed) - matching actual MIS file structure:
        // Customer Group=column C (2), Source Warehouse=column K (10), SO Item=column L (11)
        // Category Raw=column M (12), Sales Order Qty=column N (13), SO Total CBM=column P (15)
        // Delivery Note Date=column S (18), Delivery Note Item=column U (20), Delivery Note Qty=column V (21)
        // DN Total CBM=column W (22), Transporter=column X (23)
        const customerGroup = this.getCellValue(row[2]); // C
        const sourceWarehouse = this.getCellValue(row[10]); // K
        const soItem = this.getCellValue(row[11]); // L
        const categoryRaw = this.getCellValue(row[12]); // M
        const salesOrderQty = this.parseNumber(row[13]); // N
        const soTotalCbm = this.parseNumber(row[15]); // P
        const deliveryNoteDate = this.parseExcelDate(row[18]); // S - Fixed date parsing
        const deliveryNoteItem = this.getCellValue(row[20]); // U
        const deliveryNoteQty = this.parseNumber(row[21]); // V
        const dnTotalCbm = this.parseNumber(row[22]); // W
        const transporter = this.getCellValue(row[23]); // X

        // Normalize category (customer group -> normalized category)
        const normalizedCategory = this.categoryNormalizer.normalizeCategory(customerGroup);
        // Normalize product category (categoryRaw/item group -> product category)
        const productCategory = this.categoryNormalizer.normalizeProductCategory(categoryRaw);

        parsedRows.push({
          customerGroup,
          sourceWarehouse,
          soItem,
          categoryRaw,
          salesOrderQty,
          soTotalCbm,
          deliveryNoteDate,
          deliveryNoteItem,
          deliveryNoteQty,
          dnTotalCbm,
          transporter,
          normalizedCategory,
          productCategory,
        });
      }

      if (parsedRows.length === 0) {
        throw new Error('No valid data rows found in the Excel file');
      }

      // Use transaction to ensure atomicity - either all data is inserted or none
      // Increase timeout to 2 minutes for large files
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Create upload record within transaction
          const upload = await tx.outboundUpload.create({
            data: {
              fileName,
              status: 'processing', // Mark as processing initially
            },
          });

          // Bulk insert rows in batches (Prisma has limits on single createMany)
          const rowsWithUploadId = parsedRows.map(row => ({
            ...row,
            uploadId: upload.id,
          }));

          for (let i = 0; i < rowsWithUploadId.length; i += OutboundService.BATCH_SIZE) {
            const batch = rowsWithUploadId.slice(i, i + OutboundService.BATCH_SIZE);
            await tx.outboundRow.createMany({
              data: batch,
            });
          }

          // Mark upload as processed after successful insertion
          await tx.outboundUpload.update({
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
      console.log(`Outbound upload: ${result.rowsInserted} rows in ${elapsed}ms`);

      return result;
    } catch (error) {
      console.error('Error processing Excel file:', error);
      const message = this.getErrorMessage(error);
      throw new Error(`Failed to process Excel file: ${message}`);
    } finally {
      // SECURITY: Always clean up temp file, even on error
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

  /**
   * Get summary data with filters
   * 
   * OPTIMIZATION: Use SQL aggregation for cards, keep category table for now
   * (category table requires row-level grouping which is more complex to optimize)
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategories?: string[],
    timeGranularity: 'month' | 'week' | 'day' = 'month',
    warehouse?: string,
  ): Promise<SummaryResponse> {
    const startTime = Date.now();

    // Generate cache key (include all filter parameters)
    // 'all' when no uploadId specified = aggregate across all uploads
    const cacheKey = `${uploadId || 'all'}-${fromDate || ''}-${toDate || ''}-${month || ''}-${(productCategories || []).sort().join(',') || 'ALL'}-${warehouse || 'ALL'}-${timeGranularity}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Determine which upload(s) to use
    // If uploadId is specified, use that specific upload
    // If not specified, aggregate data from ALL processed uploads
    let targetUploadIds: string[] = [];
    if (uploadId) {
      targetUploadIds = [uploadId];
    } else {
      const allUploads = await this.prisma.outboundUpload.findMany({
        where: { status: 'processed' },
        select: { id: true },
      });

      if (allUploads.length === 0) {
        throw new NotFoundException('No processed uploads found');
      }

      targetUploadIds = allUploads.map(u => u.id);
    }

    // Build date filter
    const dateFilter: any = {};
    
    // Handle month filter
    if (month && month !== 'ALL') {
      const [year, monthNum] = month.includes('-') 
        ? month.split('-').map(Number)
        : this.parseMonthName(month);
      
      if (year && monthNum) {
        // Create dates using ISO string format to ensure correct timezone handling
        const startDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-01T00:00:00`);
        // Get last day of month
        const lastDay = new Date(year, monthNum, 0).getDate();
        const endDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`);
        dateFilter.gte = startDate;
        dateFilter.lte = endDate;
      }
    } else {
      if (fromDate) {
        // Parse date and set to start of day in local timezone
        const from = new Date(fromDate + 'T00:00:00');
        dateFilter.gte = from;
      }
      if (toDate) {
        // Parse date and set to end of day in local timezone
        const to = new Date(toDate + 'T23:59:59');
        dateFilter.lte = to;
      }
    }

    // Build product category filter (now supports multiple categories)
    const productCategoryFilter = productCategories && productCategories.length > 0
      ? productCategories.filter(c => c !== 'ALL') as ProductCategory[]
      : undefined;

    // Build warehouse filter
    const warehouseFilter = warehouse && warehouse !== 'ALL' ? warehouse : undefined;

    // Run parallel queries for all data (aggregating across all uploads if multiple)
    const [cards, categoryTable, productCategoryTable, availableMonths, productCategoriesList, availableWarehouses, timeSeries, summaryTotals] = await Promise.all([
      this.calculateCardMetricsOptimized(targetUploadIds, dateFilter, productCategoryFilter, warehouseFilter),
      this.calculateCategoryTableOptimized(targetUploadIds, dateFilter, productCategoryFilter, warehouseFilter),
      this.calculateProductCategoryTable(targetUploadIds, dateFilter, warehouseFilter),
      this.getAvailableMonthsOptimized(targetUploadIds),
      this.getProductCategories(),
      this.getAvailableWarehouses(targetUploadIds),
      this.calculateTimeSeries(targetUploadIds, timeGranularity, warehouseFilter),
      this.calculateSummaryTotals(targetUploadIds, dateFilter, productCategoryFilter, warehouseFilter),
    ]);

    const result = {
      cards,
      categoryTable,
      productCategoryTable,
      availableMonths,
      productCategories: productCategoriesList,
      availableWarehouses,
      timeSeries,
      summaryTotals,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(`Outbound getSummary: ${elapsed}ms`);

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
   * OPTIMIZATION: Calculate card metrics using SQL aggregation
   * Supports multiple upload IDs for aggregating across all uploads
   */
  private async calculateCardMetricsOptimized(
    uploadIds: string[],
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory[],
    warehouse?: string,
  ): Promise<CardMetrics> {
    let dateCondition = '';
    const params: any[] = [uploadIds];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter && productCategoryFilter.length > 0) {
      const placeholders = productCategoryFilter.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategoryFilter);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }
    if (warehouse) {
      params.push(warehouse);
      dateCondition += ` AND source_warehouse = $${params.length}`;
    }

    const result = await this.prisma.$queryRawUnsafe<[{
      so_sku: bigint;
      so_qty: number;
      so_total_cbm: number;
      dn_sku: bigint;
      dn_qty: number;
      dn_total_cbm: number;
    }]>(`
      SELECT 
        COUNT(DISTINCT so_item) as so_sku,
        COALESCE(SUM(sales_order_qty), 0) as so_qty,
        COALESCE(SUM(so_total_cbm), 0) as so_total_cbm,
        COUNT(DISTINCT delivery_note_item) as dn_sku,
        COALESCE(SUM(delivery_note_qty), 0) as dn_qty,
        COALESCE(SUM(dn_total_cbm), 0) as dn_total_cbm
      FROM outbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
    `, ...params);

    const row = result[0];
    const soQty = Number(row?.so_qty || 0);
    const dnQty = Number(row?.dn_qty || 0);

    return {
      soSku: Number(row?.so_sku || 0),
      soQty: Math.round(soQty),
      soTotalCbm: Math.round(Number(row?.so_total_cbm || 0) * 100) / 100,
      dnSku: Number(row?.dn_sku || 0),
      dnQty: Math.round(dnQty),
      dnTotalCbm: Math.round(Number(row?.dn_total_cbm || 0) * 100) / 100,
      soMinusDnQty: Math.round(soQty - dnQty),
    };
  }

  /**
   * OPTIMIZATION: Calculate category table using SQL GROUP BY
   * Previous: Fetch all rows, filter and aggregate per category in JS
   * After: Single SQL query with GROUP BY normalized_category
   * Supports multiple upload IDs for aggregating across all uploads
   */
  private async calculateCategoryTableOptimized(
    uploadIds: string[],
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory[],
    warehouse?: string,
  ): Promise<CategoryRow[]> {
    let dateCondition = '';
    const params: any[] = [uploadIds];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter && productCategoryFilter.length > 0) {
      const placeholders = productCategoryFilter.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategoryFilter);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }
    if (warehouse) {
      params.push(warehouse);
      dateCondition += ` AND source_warehouse = $${params.length}`;
    }

    // Query with GROUP BY for category aggregation
    const categoryResults = await this.prisma.$queryRawUnsafe<Array<{
      normalized_category: string;
      so_count: bigint;
      so_qty: number;
      so_total_cbm: number;
      dn_count: bigint;
      dn_qty: number;
      dn_total_cbm: number;
    }>>(`
      SELECT 
        normalized_category,
        COUNT(DISTINCT so_item) as so_count,
        COALESCE(SUM(sales_order_qty), 0) as so_qty,
        COALESCE(SUM(so_total_cbm), 0) as so_total_cbm,
        COUNT(DISTINCT delivery_note_item) as dn_count,
        COALESCE(SUM(delivery_note_qty), 0) as dn_qty,
        COALESCE(SUM(dn_total_cbm), 0) as dn_total_cbm
      FROM outbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
      GROUP BY normalized_category
    `, ...params);

    // Build category map for quick lookup
    const categoryMap = new Map<string, typeof categoryResults[0]>();
    for (const row of categoryResults) {
      categoryMap.set(row.normalized_category, row);
    }

    // Build category rows in expected order
    const categories = [
      NormalizedCategory.E_COMMERCE,
      NormalizedCategory.OFFLINE,
      NormalizedCategory.QUICK_COMMERCE,
      NormalizedCategory.EBO,
      NormalizedCategory.B2C,
      NormalizedCategory.OTHERS,
    ];

    const categoryRows: CategoryRow[] = [];
    let totalSoCount = 0, totalSoQty = 0, totalSoTotalCbm = 0;
    let totalDnCount = 0, totalDnQty = 0, totalDnTotalCbm = 0;

    for (const category of categories) {
      const data = categoryMap.get(category);
      const soQty = Number(data?.so_qty || 0);
      const dnQty = Number(data?.dn_qty || 0);
      const soCount = Number(data?.so_count || 0);
      const dnCount = Number(data?.dn_count || 0);
      const soTotalCbm = Number(data?.so_total_cbm || 0);
      const dnTotalCbm = Number(data?.dn_total_cbm || 0);

      categoryRows.push({
        categoryLabel: this.categoryNormalizer.getCategoryLabel(category),
        soCount,
        soQty: Math.round(soQty),
        soTotalCbm: Math.round(soTotalCbm * 100) / 100,
        dnCount,
        dnQty: Math.round(dnQty),
        dnTotalCbm: Math.round(dnTotalCbm * 100) / 100,
        soMinusDnQty: Math.round(soQty - dnQty),
      });

      // Accumulate totals (note: distinct counts need separate query for true accuracy)
      totalSoQty += soQty;
      totalDnQty += dnQty;
      totalSoTotalCbm += soTotalCbm;
      totalDnTotalCbm += dnTotalCbm;
    }

    // Get accurate distinct counts for TOTAL row
    const totalResult = await this.prisma.$queryRawUnsafe<[{
      so_count: bigint;
      dn_count: bigint;
    }]>(`
      SELECT 
        COUNT(DISTINCT so_item) as so_count,
        COUNT(DISTINCT delivery_note_item) as dn_count
      FROM outbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
    `, ...params);

    // Add TOTAL row
    categoryRows.push({
      categoryLabel: 'TOTAL',
      soCount: Number(totalResult[0]?.so_count || 0),
      soQty: Math.round(totalSoQty),
      soTotalCbm: Math.round(totalSoTotalCbm * 100) / 100,
      dnCount: Number(totalResult[0]?.dn_count || 0),
      dnQty: Math.round(totalDnQty),
      dnTotalCbm: Math.round(totalDnTotalCbm * 100) / 100,
      soMinusDnQty: Math.round(totalSoQty - totalDnQty),
    });

    return categoryRows;
  }

  /**
   * OPTIMIZATION: Get available months using SQL date extraction
   * Previous: Fetch all distinct dates, process in JS
   * After: Use SQL date_trunc/extract for direct month aggregation
   * Supports multiple upload IDs
   */
  private async getAvailableMonthsOptimized(uploadIds: string[]): Promise<string[]> {
    const result = await this.prisma.$queryRawUnsafe<Array<{ month_str: string }>>(`
      SELECT DISTINCT 
        TO_CHAR(delivery_note_date, 'YYYY-MM') as month_str
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND delivery_note_date IS NOT NULL
      ORDER BY month_str
    `, uploadIds);

    const months = result.map(r => r.month_str).filter(Boolean);
    return ['ALL', ...months];
  }

  /**
   * Get available warehouses from all uploads
   * Returns distinct source_warehouse values
   */
  private async getAvailableWarehouses(uploadIds: string[]): Promise<string[]> {
    const result = await this.prisma.$queryRawUnsafe<Array<{ warehouse: string }>>(`
      SELECT DISTINCT 
        source_warehouse as warehouse
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND source_warehouse IS NOT NULL
        AND source_warehouse != ''
      ORDER BY warehouse
    `, uploadIds);

    const warehouses = result.map(r => r.warehouse).filter(Boolean);
    return ['ALL', ...warehouses];
  }

  /**
   * Get list of product categories for filter dropdown
   * Returns raw enum values for filtering (frontend displays them nicely)
   */
  private async getProductCategories(): Promise<string[]> {
    // Return raw enum values - these are used for filtering
    // The frontend can display them with proper formatting
    const categories = Object.values(ProductCategory);
    return ['ALL', ...categories];
  }

  /**
   * Convert product category enum to display label
   */
  private getProductCategoryLabel(category: string): string {
    const labelMap: Record<string, string> = {
      'EDEL': 'EDEL',
      'HOME_AND_KITCHEN': 'Home & Kitchen',
      'ELECTRONICS': 'Electronics',
      'HEALTH_AND_PERSONAL_CARE': 'Health & Personal Care',
      'AUTOMOTIVE_AND_TOOLS': 'Automotive & Tools',
      'TOYS_AND_GAMES': 'Toys & Games',
      'BRAND_PRIVATE_LABEL': 'Brand Private Label',
      'OTHERS': 'Others',
      'ALL': 'All Categories',
    };
    return labelMap[category] || category;
  }

  /**
   * Calculate product category table using SQL GROUP BY
   * Supports multiple upload IDs
   */
  private async calculateProductCategoryTable(
    uploadIds: string[],
    dateFilter: { gte?: Date; lte?: Date },
    warehouse?: string,
  ): Promise<CategoryRow[]> {
    let dateCondition = '';
    const params: any[] = [uploadIds];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (warehouse) {
      params.push(warehouse);
      dateCondition += ` AND source_warehouse = $${params.length}`;
    }

    // Query with GROUP BY for product category aggregation
    const categoryResults = await this.prisma.$queryRawUnsafe<Array<{
      product_category: string;
      so_count: bigint;
      so_qty: number;
      so_total_cbm: number;
      dn_count: bigint;
      dn_qty: number;
      dn_total_cbm: number;
    }>>(`
      SELECT 
        product_category,
        COUNT(DISTINCT so_item) as so_count,
        COALESCE(SUM(sales_order_qty), 0) as so_qty,
        COALESCE(SUM(so_total_cbm), 0) as so_total_cbm,
        COUNT(DISTINCT delivery_note_item) as dn_count,
        COALESCE(SUM(delivery_note_qty), 0) as dn_qty,
        COALESCE(SUM(dn_total_cbm), 0) as dn_total_cbm
      FROM outbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
      GROUP BY product_category
    `, ...params);

    // Build category map for quick lookup
    const categoryMap = new Map<string, typeof categoryResults[0]>();
    for (const row of categoryResults) {
      categoryMap.set(row.product_category, row);
    }

    // Build category rows in expected order
    const categories = Object.values(ProductCategory);

    const categoryRows: CategoryRow[] = [];
    let totalSoQty = 0, totalDnQty = 0;
    let totalSoTotalCbm = 0, totalDnTotalCbm = 0;

    for (const category of categories) {
      const data = categoryMap.get(category);
      const soQty = Number(data?.so_qty || 0);
      const dnQty = Number(data?.dn_qty || 0);
      const soCount = Number(data?.so_count || 0);
      const dnCount = Number(data?.dn_count || 0);
      const soTotalCbm = Number(data?.so_total_cbm || 0);
      const dnTotalCbm = Number(data?.dn_total_cbm || 0);

      // Convert enum to display label
      const labelMap: Record<string, string> = {
        'EDEL': 'EDEL',
        'HOME_AND_KITCHEN': 'Home & Kitchen',
        'ELECTRONICS': 'Electronics',
        'HEALTH_AND_PERSONAL_CARE': 'Health & Personal Care',
        'AUTOMOTIVE_AND_TOOLS': 'Automotive & Tools',
        'TOYS_AND_GAMES': 'Toys & Games',
        'BRAND_PRIVATE_LABEL': 'Brand Private Label',
        'OTHERS': 'Others',
      };

      categoryRows.push({
        categoryLabel: labelMap[category] || category,
        soCount,
        soQty: Math.round(soQty),
        soTotalCbm: Math.round(soTotalCbm * 100) / 100,
        dnCount,
        dnQty: Math.round(dnQty),
        dnTotalCbm: Math.round(dnTotalCbm * 100) / 100,
        soMinusDnQty: Math.round(soQty - dnQty),
      });

      totalSoQty += soQty;
      totalDnQty += dnQty;
      totalSoTotalCbm += soTotalCbm;
      totalDnTotalCbm += dnTotalCbm;
    }

    // Get accurate distinct counts for TOTAL row
    const totalResult = await this.prisma.$queryRawUnsafe<[{
      so_count: bigint;
      dn_count: bigint;
    }]>(`
      SELECT 
        COUNT(DISTINCT so_item) as so_count,
        COUNT(DISTINCT delivery_note_item) as dn_count
      FROM outbound_rows
      WHERE upload_id = ANY($1) ${dateCondition}
    `, ...params);

    // Add TOTAL row
    categoryRows.push({
      categoryLabel: 'TOTAL',
      soCount: Number(totalResult[0]?.so_count || 0),
      soQty: Math.round(totalSoQty),
      soTotalCbm: Math.round(totalSoTotalCbm * 100) / 100,
      dnCount: Number(totalResult[0]?.dn_count || 0),
      dnQty: Math.round(totalDnQty),
      dnTotalCbm: Math.round(totalDnTotalCbm * 100) / 100,
      soMinusDnQty: Math.round(totalSoQty - totalDnQty),
    });

    return categoryRows;
  }

  /**
   * Calculate time series data for charts
   * Supports multiple upload IDs
   */
  private async calculateTimeSeries(
    uploadIds: string[],
    granularity: 'month' | 'week' | 'day',
    warehouse?: string,
  ): Promise<TimeSeriesData> {
    let dateFormat: string;
    let groupBy: string;
    
    switch (granularity) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        groupBy = `DATE(delivery_note_date)`;
        break;
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO year and week
        groupBy = `DATE_TRUNC('week', delivery_note_date)`;
        break;
      case 'month':
      default:
        dateFormat = 'YYYY-MM';
        groupBy = `DATE_TRUNC('month', delivery_note_date)`;
        break;
    }

    const params: any[] = [uploadIds];
    let warehouseCondition = '';
    if (warehouse) {
      params.push(warehouse);
      warehouseCondition = ` AND source_warehouse = $${params.length}`;
    }

    const result = await this.prisma.$queryRawUnsafe<Array<{
      period: Date;
      period_label: string;
      so_qty: number;
      so_total_cbm: number;
      dn_qty: number;
      dn_total_cbm: number;
    }>>(`
      SELECT 
        ${groupBy} as period,
        TO_CHAR(${groupBy}, '${dateFormat}') as period_label,
        COALESCE(SUM(sales_order_qty), 0) as so_qty,
        COALESCE(SUM(so_total_cbm), 0) as so_total_cbm,
        COALESCE(SUM(delivery_note_qty), 0) as dn_qty,
        COALESCE(SUM(dn_total_cbm), 0) as dn_total_cbm
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND delivery_note_date IS NOT NULL
        ${warehouseCondition}
      GROUP BY ${groupBy}
      ORDER BY period
    `, ...params);

    const points: TimeSeriesPoint[] = result.map(row => {
      const period = new Date(row.period);
      let startDate: string;
      let endDate: string;
      let label: string;
      
      switch (granularity) {
        case 'day':
          startDate = period.toISOString().split('T')[0];
          endDate = startDate;
          label = row.period_label;
          break;
        case 'week':
          startDate = period.toISOString().split('T')[0];
          const weekEnd = new Date(period);
          weekEnd.setDate(weekEnd.getDate() + 6);
          endDate = weekEnd.toISOString().split('T')[0];
          label = `Week ${row.period_label.split('-')[1]}`;
          break;
        case 'month':
        default:
          startDate = period.toISOString().split('T')[0];
          const monthEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0);
          endDate = monthEnd.toISOString().split('T')[0];
          // Format as "Aug'25", "Sep'25", etc.
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          label = `${monthNames[period.getMonth()]}'${period.getFullYear().toString().slice(-2)}`;
          break;
      }

      return {
        key: row.period_label,
        label,
        soQty: Math.round(Number(row.so_qty)),
        soTotalCbm: Math.round(Number(row.so_total_cbm) * 100) / 100,
        dnQty: Math.round(Number(row.dn_qty)),
        dnTotalCbm: Math.round(Number(row.dn_total_cbm) * 100) / 100,
        startDate,
        endDate,
      };
    });

    return {
      granularity,
      points,
    };
  }

  /**
   * Calculate summary totals with day-by-day breakdown
   * Supports multiple upload IDs
   */
  private async calculateSummaryTotals(
    uploadIds: string[],
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory[],
    warehouse?: string,
  ): Promise<SummaryTotals> {
    let dateCondition = '';
    const params: any[] = [uploadIds];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter && productCategoryFilter.length > 0) {
      const placeholders = productCategoryFilter.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
      params.push(...productCategoryFilter);
      dateCondition += ` AND product_category IN (${placeholders})`;
    }
    if (warehouse) {
      params.push(warehouse);
      dateCondition += ` AND source_warehouse = $${params.length}`;
    }

    // Get day-by-day breakdown
    const dayResults = await this.prisma.$queryRawUnsafe<Array<{
      day_date: Date;
      day_label: string;
      dn_qty: number;
      dn_cbm: number;
      edel_dn_qty: number;
      edel_dn_cbm: number;
    }>>(`
      SELECT 
        DATE(delivery_note_date) as day_date,
        TO_CHAR(delivery_note_date, 'YYYY-MM-DD') as day_label,
        COALESCE(SUM(delivery_note_qty), 0) as dn_qty,
        COALESCE(SUM(dn_total_cbm), 0) as dn_cbm,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN delivery_note_qty ELSE 0 END), 0) as edel_dn_qty,
        COALESCE(SUM(CASE WHEN product_category = 'EDEL' THEN dn_total_cbm ELSE 0 END), 0) as edel_dn_cbm
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND delivery_note_date IS NOT NULL
        ${dateCondition}
      GROUP BY DATE(delivery_note_date), TO_CHAR(delivery_note_date, 'YYYY-MM-DD')
      ORDER BY day_date
    `, ...params);

    const dayData: DayData[] = dayResults.map(row => ({
      date: row.day_label,
      label: row.day_label,
      dnQty: Math.round(Number(row.dn_qty)),
      dnCbm: Math.round(Number(row.dn_cbm) * 100) / 100,
      edelDnQty: Math.round(Number(row.edel_dn_qty)),
      edelDnCbm: Math.round(Number(row.edel_dn_cbm) * 100) / 100,
    }));

    // Calculate totals
    const totalDnQty = dayData.reduce((sum, d) => sum + d.dnQty, 0);
    const totalDnCbm = dayData.reduce((sum, d) => sum + d.dnCbm, 0);
    const totalEdelDnQty = dayData.reduce((sum, d) => sum + d.edelDnQty, 0);
    const totalEdelDnCbm = dayData.reduce((sum, d) => sum + d.edelDnCbm, 0);

    return {
      totalDnQty,
      totalDnCbm: Math.round(totalDnCbm * 100) / 100,
      totalEdelDnQty,
      totalEdelDnCbm: Math.round(totalEdelDnCbm * 100) / 100,
      dayData,
    };
  }

  /**
   * Get list of outbound uploads
   */
  async getUploads() {
    const uploads = await this.prisma.outboundUpload.findMany({
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
      type: 'outbound',
    }));
  }

  /**
   * Delete an outbound upload and all associated data
   */
  async deleteUpload(uploadId: string): Promise<void> {
    const upload = await this.prisma.outboundUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) {
      throw new NotFoundException(`Outbound upload with ID ${uploadId} not found`);
    }

    await this.prisma.outboundUpload.delete({
      where: { id: uploadId },
    });

    this.cache.clear();
  }

  /**
   * Upload file (wrapper for controller compatibility)
   */
  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    return this.uploadExcel(file.path, file.originalname);
  }

  /**
   * Generate detailed Excel export (stub for now)
   */
  async generateDetailedExcel(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategories?: string[],
  ): Promise<Buffer> {
    // Get summary data
    const summary = await this.getSummary(uploadId, fromDate, toDate, month, productCategories, 'month');
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Add category table sheet
    const wsData = [
      ['Category', 'SO Count', 'SO Qty', 'SO CBM', 'DN Count', 'DN Qty', 'DN CBM', 'SO-DN Qty'],
      ...summary.categoryTable.map(row => [
        row.categoryLabel,
        row.soCount,
        row.soQty,
        row.soTotalCbm,
        row.dnCount,
        row.dnQty,
        row.dnTotalCbm,
        row.soMinusDnQty,
      ]),
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Category Summary');

    // Add overall summary totals sheet
    const totals = summary.summaryTotals;
    const totalsWsData = [
      ['Metric', 'Value'],
      ['Total DN Qty', totals.totalDnQty],
      ['Total DN CBM', totals.totalDnCbm],
      ['Total EDEL DN Qty', totals.totalEdelDnQty],
      ['Total EDEL DN CBM', totals.totalEdelDnCbm],
    ];

    const totalsWs = XLSX.utils.aoa_to_sheet(totalsWsData);
    XLSX.utils.book_append_sheet(workbook, totalsWs, 'Summary Totals');

    // Add day-by-day breakdown sheet
    const dayHeader = ['Date', 'DN Qty', 'DN CBM', 'EDEL DN Qty', 'EDEL DN CBM'];
    const dayRows = summary.summaryTotals.dayData.map(d => [
      d.date,
      d.dnQty,
      d.dnCbm,
      d.edelDnQty,
      d.edelDnCbm,
    ]);

    const dayWs = XLSX.utils.aoa_to_sheet([
      ...[dayHeader],
      ...dayRows,
    ]);
    XLSX.utils.book_append_sheet(workbook, dayWs, 'Daily Breakdown');
    
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
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
   * Excel also has a leap year bug where it thinks 1900 was a leap year,
   * so serial numbers >= 60 need adjustment.
   */
  private parseExcelDate(cell: unknown): Date | null {
    if (cell === undefined || cell === null || cell === '') return null;
    
    try {
      // Handle Excel serial date numbers
      if (typeof cell === 'number') {
        // Excel serial number: days since 1899-12-30
        // Note: Excel incorrectly treats 1900 as a leap year (Lotus 1-2-3 bug)
        // Serial 60 = Feb 29, 1900 (doesn't exist) but we need to handle it
        // Serial 61 = Mar 1, 1900
        // For dates >= 60, we need to subtract 1 to account for this bug
        
        // Excel epoch is Dec 30, 1899 (serial 0)
        // But due to the 1900 leap year bug, we use Dec 31, 1899 for serial >= 60
        const serialNumber = Math.floor(cell);
        
        if (serialNumber < 1) return null; // Invalid serial
        if (serialNumber > 2958465) return null; // Beyond year 9999
        
        // Adjust for Excel's leap year bug
        const adjustedSerial = serialNumber >= 60 ? serialNumber - 1 : serialNumber;
        
        // Calculate date from epoch (Jan 1, 1900 = serial 1, after adjustment)
        const date = new Date(1899, 11, 31 + adjustedSerial);
        
        // Handle time component if present (fractional part of serial)
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
        
        // Try ISO format first (YYYY-MM-DD)
        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const [, year, month, day] = isoMatch;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Try common formats (DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY)
        const dateMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dateMatch) {
          const [, part1, part2, yearPart] = dateMatch;
          const year = parseInt(yearPart) < 100 ? 2000 + parseInt(yearPart) : parseInt(yearPart);
          // Assume DD/MM/YYYY for international format
          const day = parseInt(part1);
          const month = parseInt(part2) - 1;
          const date = new Date(year, month, day);
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Fallback to Date.parse
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date;
      }
      
      // Handle Date objects passed through
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

  private parseMonthName(monthStr: string): [number, number] {
    // Simple parser for "January 2025" format
    const parts = monthStr.trim().split(' ');
    if (parts.length === 2) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIndex = monthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
      if (monthIndex !== -1) {
        return [Number(parts[1]), monthIndex + 1];
      }
    }
    return [0, 0];
  }

  /**
   * Get top/bottom selling products by CBM or Qty from delivery note items
   * @param rankBy - 'cbm' or 'qty' to determine ranking metric
   * @param sortOrder - 'top' for highest first, 'bottom' for lowest first
   */
  async getTopProducts(
    limit: number = 10,
    month?: string,
    fromDate?: string,
    toDate?: string,
    warehouse?: string,
    productCategories?: string[],
    rankBy: 'cbm' | 'qty' = 'cbm',
    sortOrder: 'top' | 'bottom' = 'top',
  ): Promise<TopProduct[]> {
    // Get all processed upload IDs
    const allUploads = await this.prisma.outboundUpload.findMany({
      where: { status: 'processed' },
      select: { id: true },
    });

    if (allUploads.length === 0) {
      return [];
    }

    const uploadIds = allUploads.map(u => u.id);

    // Build query conditions
    let dateCondition = '';
    const params: any[] = [uploadIds];

    // Handle month filter
    if (month && month !== 'ALL') {
      const [year, monthNum] = month.includes('-')
        ? month.split('-').map(Number)
        : this.parseMonthName(month);

      if (year && monthNum) {
        // Create dates using ISO string format to ensure correct timezone handling
        const startDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-01T00:00:00`);
        // Get last day of month
        const lastDay = new Date(year, monthNum, 0).getDate();
        const endDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`);
        params.push(startDate);
        dateCondition += ` AND delivery_note_date >= $${params.length}`;
        params.push(endDate);
        dateCondition += ` AND delivery_note_date <= $${params.length}`;
      }
    } else {
      if (fromDate) {
        // Parse date and set to start of day in local timezone
        params.push(new Date(fromDate + 'T00:00:00'));
        dateCondition += ` AND delivery_note_date >= $${params.length}`;
      }
      if (toDate) {
        // Parse date and set to end of day in local timezone
        params.push(new Date(toDate + 'T23:59:59'));
        dateCondition += ` AND delivery_note_date <= $${params.length}`;
      }
    }

    // Warehouse filter
    if (warehouse && warehouse !== 'ALL') {
      params.push(warehouse);
      dateCondition += ` AND source_warehouse = $${params.length}`;
    }

    // Product category filter
    if (productCategories && productCategories.length > 0) {
      const filtered = productCategories.filter(c => c !== 'ALL');
      if (filtered.length > 0) {
        const placeholders = filtered.map((_, i) => `$${params.length + i + 1}::"ProductCategory"`).join(', ');
        params.push(...filtered);
        dateCondition += ` AND product_category IN (${placeholders})`;
      }
    }

    // Add limit parameter
    params.push(limit);
    const limitParam = `$${params.length}`;

    // Determine ORDER BY clause based on rankBy and sortOrder
    const orderByColumn = rankBy === 'qty' ? 'total_qty' : 'total_cbm';
    const orderDirection = sortOrder === 'bottom' ? 'ASC' : 'DESC';

    // First, get the total sum for percentage calculation (without limit param)
    const paramsForTotal = params.slice(0, -1); // Remove the limit param
    const totalResult = await this.prisma.$queryRawUnsafe<Array<{
      total_sum: number;
    }>>(`
      SELECT 
        COALESCE(SUM(${rankBy === 'qty' ? 'delivery_note_qty' : 'dn_total_cbm'}), 0) as total_sum
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND delivery_note_item IS NOT NULL
        AND delivery_note_item != ''
        ${dateCondition}
    `, ...paramsForTotal);

    const totalSum = Number(totalResult[0]?.total_sum) || 0;

    // Query to get top/bottom products by CBM or Qty
    const result = await this.prisma.$queryRawUnsafe<Array<{
      delivery_note_item: string;
      total_cbm: number;
      total_qty: number;
      product_category: string;
    }>>(`
      SELECT 
        delivery_note_item,
        COALESCE(SUM(dn_total_cbm), 0) as total_cbm,
        COALESCE(SUM(delivery_note_qty), 0) as total_qty,
        MAX(product_category) as product_category
      FROM outbound_rows
      WHERE upload_id = ANY($1)
        AND delivery_note_item IS NOT NULL
        AND delivery_note_item != ''
        ${dateCondition}
      GROUP BY delivery_note_item
      ORDER BY ${orderByColumn} ${orderDirection}
      LIMIT ${limitParam}
    `, ...params);

    // Map to TopProduct interface with rank and percentage
    return result.map((row, index) => {
      const value = rankBy === 'qty' ? Number(row.total_qty) : Number(row.total_cbm);
      const percentage = totalSum > 0 ? Math.round((value / totalSum) * 10000) / 100 : 0;
      
      return {
        rank: index + 1,
        deliveryNoteItem: row.delivery_note_item,
        totalCbm: Math.round(Number(row.total_cbm) * 100) / 100,
        totalQty: Math.round(Number(row.total_qty)),
        productCategory: this.getProductCategoryLabel(row.product_category),
        percentageOfTotal: percentage,
      };
    });
  }
}
