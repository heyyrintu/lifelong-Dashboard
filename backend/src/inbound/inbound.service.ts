import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export interface ItemMasterUploadResult {
  rowsProcessed: number;
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
}

export interface InboundSummaryResponse {
  cards: InboundCardMetrics;
  availableDates: {
    minDate: string | null;
    maxDate: string | null;
  };
}

@Injectable()
export class InboundService {
  private cache = new Map<string, InboundSummaryResponse>();

  constructor(private prisma: PrismaService) {}

  /**
   * Parse and store Item Master Excel file
   */
  async uploadItemMaster(filePath: string): Promise<ItemMasterUploadResult> {
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip header row (index 0), start from row 2
      const dataRows = rawData.slice(1);

      let rowsProcessed = 0;

      for (const row of dataRows) {
        // Skip empty rows
        if (!row || row.length === 0) continue;

        // Excel columns (0-indexed):
        // ID=column B (1), Item Group=column D (3), CBM=column H (7)
        const id = this.getCellValue(row[1]); // B
        const itemGroup = this.getCellValue(row[3]); // D
        const cbmPerUnit = this.parseNumber(row[7]); // H

        if (!id) continue; // Skip rows without ID

        // Upsert into item_master
        await this.prisma.itemMaster.upsert({
          where: { id },
          update: {
            itemGroup: itemGroup || 'Others',
            cbmPerUnit: cbmPerUnit || 0,
          },
          create: {
            id,
            itemGroup: itemGroup || 'Others',
            cbmPerUnit: cbmPerUnit || 0,
          },
        });

        rowsProcessed++;
      }

      // Clean up file
      fs.unlinkSync(filePath);

      // Clear cache when item master is updated
      this.cache.clear();

      return { rowsProcessed };
    } catch (error) {
      console.error('Error processing Item Master Excel file:', error);
      throw new Error(`Failed to process Item Master Excel file: ${error.message}`);
    }
  }

  /**
   * Parse and store Inbound Excel file
   */
  async uploadInbound(filePath: string, fileName: string): Promise<InboundUploadResult> {
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip row 1 (blank), row 2 has headers, data starts at row 3
      const dataRows = rawData.slice(2);

      // Create upload record
      const upload = await this.prisma.inboundUpload.create({
        data: {
          fileName,
          status: 'processed',
        },
      });

      // Build item master map for CBM lookup
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

      const parsedRows = [];

      for (const row of dataRows) {
        // Skip empty rows
        if (!row || row.length === 0) continue;

        // Excel columns (0-indexed):
        // Date of Unload=column B (1), Invoice SKU=column I (8), Received SKU=column J (9)
        // Invoice Qty=column K (10), Received Qty=column L (11), Good=column N (13)
        const dateOfUnload = this.parseDate(row[1]); // B
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
          cbmPerUnit = master.cbmPerUnit || 0;
          itemGroup = master.itemGroup || 'Others';
        }

        totalCbm = receivedQty * cbmPerUnit;

        parsedRows.push({
          uploadId: upload.id,
          dateOfUnload,
          invoiceSku,
          receivedSku,
          invoiceQty,
          receivedQty,
          goodQty,
          itemGroup,
          cbmPerUnit,
          totalCbm,
        });
      }

      // Bulk insert rows
      if (parsedRows.length > 0) {
        await this.prisma.inboundRow.createMany({
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
      console.error('Error processing Inbound Excel file:', error);
      throw new Error(`Failed to process Inbound Excel file: ${error.message}`);
    }
  }

  /**
   * Get inbound summary data with filters
   */
  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<InboundSummaryResponse> {
    // Generate cache key
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Determine which upload to use
    let targetUploadId = uploadId;
    if (!targetUploadId) {
      const latestUpload = await this.prisma.inboundUpload.findFirst({
        where: { status: 'processed' },
        orderBy: { uploadedAt: 'desc' },
      });

      if (!latestUpload) {
        throw new NotFoundException('No processed inbound uploads found');
      }

      targetUploadId = latestUpload.id;
    }

    // Build date filter
    const dateFilter: any = {};
    if (fromDate) {
      dateFilter.gte = new Date(fromDate);
    }
    if (toDate) {
      dateFilter.lte = new Date(toDate);
    }

    const whereClause: any = { uploadId: targetUploadId };
    if (Object.keys(dateFilter).length > 0) {
      whereClause.dateOfUnload = dateFilter;
    }

    // Fetch filtered rows
    const rows = await this.prisma.inboundRow.findMany({
      where: whereClause,
    });

    // Calculate card metrics
    const cards = this.calculateCardMetrics(rows);

    // Get available dates
    const availableDates = await this.getAvailableDates(targetUploadId);

    const result = {
      cards,
      availableDates,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
  }

  private calculateCardMetrics(rows: any[]): InboundCardMetrics {
    const uniqueInvoiceSkus = new Set(rows.map((r) => r.invoiceSku).filter(Boolean));
    const uniqueReceivedSkus = new Set(rows.map((r) => r.receivedSku).filter(Boolean));

    const invoiceQtyTotal = rows.reduce((sum, r) => sum + (r.invoiceQty || 0), 0);
    const receivedQtyTotal = rows.reduce((sum, r) => sum + (r.receivedQty || 0), 0);
    const goodQtyTotal = rows.reduce((sum, r) => sum + (r.goodQty || 0), 0);
    const totalCbm = rows.reduce((sum, r) => sum + (r.totalCbm || 0), 0);

    return {
      invoiceSkuCount: uniqueInvoiceSkus.size,
      receivedSkuCount: uniqueReceivedSkus.size,
      invoiceQtyTotal: Math.round(invoiceQtyTotal * 100) / 100,
      receivedQtyTotal: Math.round(receivedQtyTotal * 100) / 100,
      goodQtyTotal: Math.round(goodQtyTotal * 100) / 100,
      totalCbm: Math.round(totalCbm * 100) / 100,
    };
  }

  private async getAvailableDates(uploadId: string): Promise<{ minDate: string | null; maxDate: string | null }> {
    const result = await this.prisma.inboundRow.aggregate({
      where: { uploadId },
      _min: { dateOfUnload: true },
      _max: { dateOfUnload: true },
    });

    return {
      minDate: result._min.dateOfUnload ? result._min.dateOfUnload.toISOString().split('T')[0] : null,
      maxDate: result._max.dateOfUnload ? result._max.dateOfUnload.toISOString().split('T')[0] : null,
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
}
