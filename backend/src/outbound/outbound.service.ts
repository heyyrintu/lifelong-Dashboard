import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryNormalizerService } from './category-normalizer.service';
import { NormalizedCategory } from '@prisma/client';
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

export interface SummaryResponse {
  cards: CardMetrics;
  categoryTable: CategoryRow[];
  availableMonths: string[];
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

        // Excel columns (0-indexed):
        // C=2, K=10, L=11, M=12, N=13, P=15, S=18, U=20, V=21, W=22, X=23
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

        // Normalize category
        const normalizedCategory = this.categoryNormalizer.normalizeCategory(customerGroup);

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
        });
      }

      // Bulk insert rows
      if (parsedRows.length > 0) {
        await this.prisma.outboundRow.createMany({
          data: parsedRows,
        });
      }

      // Clean up file
      fs.unlinkSync(filePath);

      // Clear cache when new data is uploaded
      this.cache.clear();

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
  ): Promise<SummaryResponse> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${month || ''}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
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

    // Run parallel queries for cards, category table, and available months
    const [cards, categoryTable, availableMonths] = await Promise.all([
      this.calculateCardMetricsOptimized(targetUploadId, dateFilter),
      this.calculateCategoryTableOptimized(targetUploadId, dateFilter),
      this.getAvailableMonthsOptimized(targetUploadId),
    ]);

    const result = {
      cards,
      categoryTable,
      availableMonths,
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
