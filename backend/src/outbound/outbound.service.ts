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
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
  ): Promise<SummaryResponse> {
    // Generate cache key
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${month || ''}`;
    
    // Check cache
    // TODO: Move to Redis in production
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Determine which upload to use
    let targetUploadId = uploadId;
    if (!targetUploadId) {
      const latestUpload = await this.prisma.outboundUpload.findFirst({
        where: { status: 'processed' },
        orderBy: { uploadedAt: 'desc' },
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
      // Expecting month in format "2025-01" or "January 2025"
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
      // Handle from/to date range
      if (fromDate) {
        dateFilter.gte = new Date(fromDate);
      }
      if (toDate) {
        dateFilter.lte = new Date(toDate);
      }
    }

    const whereClause: any = { uploadId: targetUploadId };
    if (Object.keys(dateFilter).length > 0) {
      whereClause.deliveryNoteDate = dateFilter;
    }

    // Fetch filtered rows
    const rows = await this.prisma.outboundRow.findMany({
      where: whereClause,
    });

    // Calculate card metrics
    const cards = this.calculateCardMetrics(rows);

    // Calculate category table
    const categoryTable = this.calculateCategoryTable(rows);

    // Get available months from this upload
    const availableMonths = await this.getAvailableMonths(targetUploadId);

    const result = {
      cards,
      categoryTable,
      availableMonths,
    };

    // Store in cache
    // TODO: Move to Redis in production with TTL
    this.cache.set(cacheKey, result);

    return result;
  }

  private calculateCardMetrics(rows: any[]): CardMetrics {
    const uniqueSoItems = new Set(rows.map((r) => r.soItem).filter(Boolean));
    const uniqueDnItems = new Set(rows.map((r) => r.deliveryNoteItem).filter(Boolean));

    const soQty = rows.reduce((sum, r) => sum + (r.salesOrderQty || 0), 0);
    const soTotalCbm = rows.reduce((sum, r) => sum + (r.soTotalCbm || 0), 0);
    const dnQty = rows.reduce((sum, r) => sum + (r.deliveryNoteQty || 0), 0);
    const dnTotalCbm = rows.reduce((sum, r) => sum + (r.dnTotalCbm || 0), 0);

    return {
      soSku: uniqueSoItems.size,
      soQty: Math.round(soQty),
      soTotalCbm: Math.round(soTotalCbm * 100) / 100,
      dnSku: uniqueDnItems.size,
      dnQty: Math.round(dnQty),
      dnTotalCbm: Math.round(dnTotalCbm * 100) / 100,
      soMinusDnQty: Math.round(soQty - dnQty),
    };
  }

  private calculateCategoryTable(rows: any[]): CategoryRow[] {
    const categories = [
      NormalizedCategory.E_COMMERCE,
      NormalizedCategory.OFFLINE,
      NormalizedCategory.QUICK_COMMERCE,
      NormalizedCategory.EBO,
      NormalizedCategory.B2C,
      NormalizedCategory.OTHERS,
    ];

    const categoryRows: CategoryRow[] = [];

    for (const category of categories) {
      const categoryData = rows.filter((r) => r.normalizedCategory === category);
      
      const uniqueSoItems = new Set(categoryData.map((r) => r.soItem).filter(Boolean));
      const uniqueDnItems = new Set(categoryData.map((r) => r.deliveryNoteItem).filter(Boolean));

      const soQty = categoryData.reduce((sum, r) => sum + (r.salesOrderQty || 0), 0);
      const soTotalCbm = categoryData.reduce((sum, r) => sum + (r.soTotalCbm || 0), 0);
      const dnQty = categoryData.reduce((sum, r) => sum + (r.deliveryNoteQty || 0), 0);
      const dnTotalCbm = categoryData.reduce((sum, r) => sum + (r.dnTotalCbm || 0), 0);

      categoryRows.push({
        categoryLabel: this.categoryNormalizer.getCategoryLabel(category),
        soCount: uniqueSoItems.size,
        soQty: Math.round(soQty),
        soTotalCbm: Math.round(soTotalCbm * 100) / 100,
        dnCount: uniqueDnItems.size,
        dnQty: Math.round(dnQty),
        dnTotalCbm: Math.round(dnTotalCbm * 100) / 100,
        soMinusDnQty: Math.round(soQty - dnQty),
      });
    }

    // Add TOTAL row
    const totalRow: CategoryRow = {
      categoryLabel: 'TOTAL',
      soCount: new Set(rows.map((r) => r.soItem).filter(Boolean)).size,
      soQty: Math.round(rows.reduce((sum, r) => sum + (r.salesOrderQty || 0), 0)),
      soTotalCbm: Math.round(rows.reduce((sum, r) => sum + (r.soTotalCbm || 0), 0) * 100) / 100,
      dnCount: new Set(rows.map((r) => r.deliveryNoteItem).filter(Boolean)).size,
      dnQty: Math.round(rows.reduce((sum, r) => sum + (r.deliveryNoteQty || 0), 0)),
      dnTotalCbm: Math.round(rows.reduce((sum, r) => sum + (r.dnTotalCbm || 0), 0) * 100) / 100,
      soMinusDnQty: Math.round(
        rows.reduce((sum, r) => sum + (r.salesOrderQty || 0), 0) -
          rows.reduce((sum, r) => sum + (r.deliveryNoteQty || 0), 0)
      ),
    };

    categoryRows.push(totalRow);

    return categoryRows;
  }

  private async getAvailableMonths(uploadId: string): Promise<string[]> {
    const rows = await this.prisma.outboundRow.findMany({
      where: { uploadId },
      select: { deliveryNoteDate: true },
      distinct: ['deliveryNoteDate'],
    });

    const monthsSet = new Set<string>();
    
    rows.forEach((row) => {
      if (row.deliveryNoteDate) {
        const date = new Date(row.deliveryNoteDate);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthsSet.add(monthStr);
      }
    });

    const months = Array.from(monthsSet).sort();
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
