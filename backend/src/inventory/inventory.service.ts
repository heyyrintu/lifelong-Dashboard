import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
}

export interface InventorySummaryResponse {
  cards: InventoryCardMetrics;
  filters: InventoryFilters;
}

interface ParsedInventoryRow {
  item: string;
  warehouse: string;
  itemGroup: string;
  cbmPerUnit: number;
  dailyQuantities: Array<{ date: Date; qty: number }>;
}

interface DateColumn {
  date: Date;
  columnIndex: number;
}

@Injectable()
export class InventoryService {
  private cache = new Map<string, InventorySummaryResponse>();

  constructor(private prisma: PrismaService) {}

  /**
   * Parse and store Inventory (Daily Stock Analytics) Excel file
   */
  async uploadInventory(filePath: string, fileName: string): Promise<InventoryUploadResult> {
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

        parsedRows.push({
          item,
          warehouse: warehouse || 'Unknown',
          itemGroup: itemGroup || 'Others',
          cbmPerUnit,
          dailyQuantities,
        });
      }

      console.log(`Parsed ${parsedRows.length} inventory rows`);

      // Bulk insert inventory rows
      let totalDailyStocksInserted = 0;

      // Use batched operations for performance
      const BATCH_SIZE = 100;
      for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
        const batch = parsedRows.slice(i, i + BATCH_SIZE);
        
        for (const row of batch) {
          // Create InventoryRow
          const inventoryRow = await this.prisma.inventoryRow.create({
            data: {
              uploadId: upload.id,
              item: row.item,
              warehouse: row.warehouse,
              itemGroup: row.itemGroup,
              cbmPerUnit: row.cbmPerUnit,
            },
          });

          // Bulk create InventoryDailyStock rows
          if (row.dailyQuantities.length > 0) {
            await this.prisma.inventoryDailyStock.createMany({
              data: row.dailyQuantities.map((dq) => ({
                inventoryRowId: inventoryRow.id,
                stockDate: dq.date,
                quantity: dq.qty,
              })),
            });
            totalDailyStocksInserted += row.dailyQuantities.length;
          }
        }
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

      console.log(`Inventory upload complete: ${parsedRows.length} rows, ${totalDailyStocksInserted} daily stock entries`);

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

      throw new Error(`Failed to process Inventory Excel file: ${error.message}`);
    }
  }

  /**
   * Get inventory summary with filters
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    itemGroup?: string,
  ): Promise<InventorySummaryResponse> {
    // Generate cache key
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${itemGroup || 'ALL'}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Determine which upload to use
    let targetUploadId = uploadId;
    if (!targetUploadId) {
      const latestUpload = await this.prisma.inventoryUpload.findFirst({
        where: { status: 'processed' },
        orderBy: { uploadedAt: 'desc' },
      });

      if (!latestUpload) {
        throw new NotFoundException('No processed inventory uploads found');
      }

      targetUploadId = latestUpload.id;
    }

    // Get available date range for this upload
    const availableDateRange = await this.getAvailableDateRange(targetUploadId);

    // Determine date filter
    let filterFromDate: Date | undefined;
    let filterToDate: Date | undefined;

    if (fromDate) {
      filterFromDate = new Date(fromDate);
    } else if (availableDateRange.minDate) {
      filterFromDate = new Date(availableDateRange.minDate);
    }

    if (toDate) {
      filterToDate = new Date(toDate);
    } else if (availableDateRange.maxDate) {
      filterToDate = new Date(availableDateRange.maxDate);
    }

    // Build where clause for InventoryRow
    const rowWhereClause: any = { uploadId: targetUploadId };
    if (itemGroup && itemGroup !== 'ALL') {
      rowWhereClause.itemGroup = itemGroup;
    }

    // Fetch filtered inventory rows with their daily stocks
    const inventoryRows = await this.prisma.inventoryRow.findMany({
      where: rowWhereClause,
      include: {
        dailyStocks: {
          where: {
            stockDate: {
              ...(filterFromDate && { gte: filterFromDate }),
              ...(filterToDate && { lte: filterToDate }),
            },
          },
        },
      },
    });

    // Calculate card metrics
    const cards = this.calculateCardMetrics(inventoryRows, filterFromDate, filterToDate);

    // Get available item groups
    const availableItemGroups = await this.getAvailableItemGroups(targetUploadId);

    const result: InventorySummaryResponse = {
      cards,
      filters: {
        availableItemGroups,
        availableDateRange,
      },
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
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
   * Calculate card metrics from filtered inventory rows
   */
  private calculateCardMetrics(
    rows: Array<{
      item: string;
      cbmPerUnit: number;
      dailyStocks: Array<{ quantity: number; stockDate: Date }>;
    }>,
    fromDate?: Date,
    toDate?: Date,
  ): InventoryCardMetrics {
    // CARD #1: Inbound SKU Count
    // Count of unique items where cbmPerUnit > 0 and has at least one daily stock record
    const inboundSkuSet = new Set<string>();
    for (const row of rows) {
      if (row.cbmPerUnit > 0 && row.dailyStocks.length > 0) {
        inboundSkuSet.add(row.item);
      }
    }
    const inboundSkuCount = inboundSkuSet.size;

    // CARD #2: Inventory QTY Total
    // Sum of all daily stock quantities across all SKUs
    let inventoryQtyTotal = 0;
    for (const row of rows) {
      for (const stock of row.dailyStocks) {
        inventoryQtyTotal += stock.quantity;
      }
    }

    // CARD #3: Total CBM
    // For each SKU: avg_qty = sum(daily_qty) / days_count, then sku_cbm = avg_qty * cbmPerUnit
    // Sum all sku_cbm to get total
    
    // Calculate number of days in the date range
    let daysCount = 1;
    if (fromDate && toDate) {
      const timeDiff = toDate.getTime() - fromDate.getTime();
      daysCount = Math.max(1, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1);
    } else {
      // Use distinct stock dates across all rows
      const allDates = new Set<string>();
      for (const row of rows) {
        for (const stock of row.dailyStocks) {
          allDates.add(stock.stockDate.toISOString().split('T')[0]);
        }
      }
      daysCount = Math.max(1, allDates.size);
    }

    let totalCbm = 0;
    for (const row of rows) {
      const skuTotalQty = row.dailyStocks.reduce((sum, s) => sum + s.quantity, 0);
      const avgQty = skuTotalQty / daysCount;
      const skuTotalCbm = avgQty * row.cbmPerUnit;
      totalCbm += skuTotalCbm;
    }

    return {
      inboundSkuCount,
      inventoryQtyTotal: Math.round(inventoryQtyTotal * 100) / 100,
      totalCbm: Math.round(totalCbm * 100) / 100,
    };
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
