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
  timeSeries: TimeSeriesData;
  summaryTotals: SummaryTotals;
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

  /**
   * Parse and store Excel file data
   */
  async uploadExcel(filePath: string, fileName: string): Promise<UploadResult> {
    try {
      const startTime = Date.now();

      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip header row (index 0)
      const dataRows = rawData.slice(1);

      // Create upload record
      const upload = await this.prisma.outboundUpload.create({
        data: {
          fileName,
          status: 'processed',
        },
      });

      const parsedRows = [];

      for (const row of dataRows) {
        // Skip empty rows
        if (!row || row.length === 0) continue;

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
        const deliveryNoteDate = this.parseDate(row[18]); // S
        const deliveryNoteItem = this.getCellValue(row[20]); // U
        const deliveryNoteQty = this.parseNumber(row[21]); // V
        const dnTotalCbm = this.parseNumber(row[22]); // W
        const transporter = this.getCellValue(row[23]); // X

        // Normalize category (customer group -> normalized category)
        const normalizedCategory = this.categoryNormalizer.normalizeCategory(customerGroup);
        // Normalize product category (categoryRaw/item group -> product category)
        const productCategory = this.categoryNormalizer.normalizeProductCategory(categoryRaw);

        parsedRows.push({
          uploadId: upload.id,
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

      // Bulk insert rows
      if (parsedRows.length > 0) {
        await this.prisma.outboundRow.createMany({
          data: parsedRows,
        });
      }

      fs.unlinkSync(filePath);

      // Clear cache when new data is uploaded
      this.cache.clear();

      const elapsed = Date.now() - startTime;
      console.log(`Outbound upload: ${parsedRows.length} rows in ${elapsed}ms`);

      return {
        uploadId: upload.id,
        rowsInserted: parsedRows.length,
      };
    } catch (error) {
      console.error('Error processing Excel file:', error);
      throw new Error(`Failed to process Excel file: ${error.message}`);
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
    productCategory?: string,
    timeGranularity: 'month' | 'week' | 'day' = 'month',
  ): Promise<SummaryResponse> {
    const startTime = Date.now();

    // Generate cache key (include all filter parameters)
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${month || ''}-${productCategory || 'ALL'}-${timeGranularity}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Determine which upload to use
    let targetUploadId = uploadId;
    if (!targetUploadId) {
      const latestUpload = await this.prisma.outboundUpload.findFirst({
        where: { status: 'processed' },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true }, // Only fetch id
      });

      if (!latestUpload) {
        throw new NotFoundException('No processed uploads found');
      }

      targetUploadId = latestUpload.id;
    }

    // Build date filter
    const dateFilter: any = {};
    
    // Handle month filter
    if (month && month !== 'ALL') {
      const [year, monthNum] = month.includes('-') 
        ? month.split('-').map(Number)
        : this.parseMonthName(month);
      
      if (year && monthNum) {
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0, 23, 59, 59);
        dateFilter.gte = startDate;
        dateFilter.lte = endDate;
      }
    } else {
      if (fromDate) {
        dateFilter.gte = new Date(fromDate);
      }
      if (toDate) {
        dateFilter.lte = new Date(toDate);
      }
    }

    // Build product category filter
    const productCategoryFilter = productCategory && productCategory !== 'ALL' 
      ? productCategory as ProductCategory 
      : undefined;

    // Run parallel queries for all data
    const [cards, categoryTable, productCategoryTable, availableMonths, productCategories, timeSeries, summaryTotals] = await Promise.all([
      this.calculateCardMetricsOptimized(targetUploadId, dateFilter, productCategoryFilter),
      this.calculateCategoryTableOptimized(targetUploadId, dateFilter, productCategoryFilter),
      this.calculateProductCategoryTable(targetUploadId, dateFilter),
      this.getAvailableMonthsOptimized(targetUploadId),
      this.getProductCategories(),
      this.calculateTimeSeries(targetUploadId, timeGranularity),
      this.calculateSummaryTotals(targetUploadId, dateFilter, productCategoryFilter),
    ]);

    const result = {
      cards,
      categoryTable,
      productCategoryTable,
      availableMonths,
      productCategories,
      timeSeries,
      summaryTotals,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(`Outbound getSummary: ${elapsed}ms`);

    return result;
  }

  /**
   * OPTIMIZATION: Calculate card metrics using SQL aggregation
   */
  private async calculateCardMetricsOptimized(
    uploadId: string,
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory,
  ): Promise<CardMetrics> {
    let dateCondition = '';
    const params: any[] = [uploadId];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter) {
      params.push(productCategoryFilter);
      dateCondition += ` AND product_category = $${params.length}::"ProductCategory"`;
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
      WHERE upload_id = $1 ${dateCondition}
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
   */
  private async calculateCategoryTableOptimized(
    uploadId: string,
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory,
  ): Promise<CategoryRow[]> {
    let dateCondition = '';
    const params: any[] = [uploadId];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter) {
      params.push(productCategoryFilter);
      dateCondition += ` AND product_category = $${params.length}::"ProductCategory"`;
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
      WHERE upload_id = $1 ${dateCondition}
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
      WHERE upload_id = $1 ${dateCondition}
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
   */
  private async getAvailableMonthsOptimized(uploadId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ month_str: string }>>` 
      SELECT DISTINCT 
        TO_CHAR(delivery_note_date, 'YYYY-MM') as month_str
      FROM outbound_rows
      WHERE upload_id = ${uploadId}
        AND delivery_note_date IS NOT NULL
      ORDER BY month_str
    `;

    const months = result.map(r => r.month_str).filter(Boolean);
    return ['ALL', ...months];
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
   */
  private async calculateProductCategoryTable(
    uploadId: string,
    dateFilter: { gte?: Date; lte?: Date },
  ): Promise<CategoryRow[]> {
    let dateCondition = '';
    const params: any[] = [uploadId];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
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
      WHERE upload_id = $1 ${dateCondition}
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
      WHERE upload_id = $1 ${dateCondition}
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
   */
  private async calculateTimeSeries(
    uploadId: string,
    granularity: 'month' | 'week' | 'day',
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
      WHERE upload_id = $1
        AND delivery_note_date IS NOT NULL
      GROUP BY ${groupBy}
      ORDER BY period
    `, uploadId);

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
   */
  private async calculateSummaryTotals(
    uploadId: string,
    dateFilter: { gte?: Date; lte?: Date },
    productCategoryFilter?: ProductCategory,
  ): Promise<SummaryTotals> {
    let dateCondition = '';
    const params: any[] = [uploadId];
    
    if (dateFilter.gte) {
      params.push(dateFilter.gte);
      dateCondition += ` AND delivery_note_date >= $${params.length}`;
    }
    if (dateFilter.lte) {
      params.push(dateFilter.lte);
      dateCondition += ` AND delivery_note_date <= $${params.length}`;
    }
    if (productCategoryFilter) {
      params.push(productCategoryFilter);
      dateCondition += ` AND product_category = $${params.length}::"ProductCategory"`;
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
      WHERE upload_id = $1 
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
    productCategory?: string,
  ): Promise<Buffer> {
    // Get summary data
    const summary = await this.getSummary(uploadId, fromDate, toDate, month, productCategory, 'month');
    
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

  private parseDate(cell: any): Date | null {
    if (!cell) return null;
    
    try {
      // Handle Excel serial date numbers
      if (typeof cell === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + cell * 86400000);
        return date;
      }
      
      // Handle string dates
      const date = new Date(cell);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
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
}
