import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

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
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  receivedQty: number;
  totalCbm: number;
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
}

// Path to the static Item Master file
const ITEM_MASTER_PATH = path.resolve(__dirname, '../../Item master.xlsx');

@Injectable()
export class InboundService implements OnModuleInit {
  private cache = new Map<string, InboundSummaryResponse>();

  constructor(private prisma: PrismaService) {}

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
        console.log(`Item Master file not found at: ${ITEM_MASTER_PATH}`);
        return;
      }

      // Check if Item Master table already has data
      const existingCount = await this.prisma.itemMaster.count();
      if (existingCount > 0) {
        console.log(`Item Master already loaded (${existingCount} items). Skipping auto-load.`);
        return;
      }

      console.log('Loading Item Master from file...');
      const result = await this.loadItemMasterInternal(ITEM_MASTER_PATH, false);
      console.log(`Item Master auto-loaded: ${result.rowsProcessed} items`);
    } catch (error) {
      console.error('Failed to auto-load Item Master:', error.message);
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
    console.log(`ItemMaster loaded: ${uniqueRecords.length} rows in ${elapsed}ms`);

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
      throw new Error(`Failed to process Item Master Excel file: ${error.message}`);
    }
  }

  /**
   * Parse and store Inbound Excel file
   */
  async uploadInbound(filePath: string, fileName: string): Promise<InboundUploadResult> {
    try {
      const startTime = Date.now();

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

      const elapsed = Date.now() - startTime;
      console.log(`Inbound upload: ${parsedRows.length} rows in ${elapsed}ms`);

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
    productCategory?: string,
    timeGranularity?: 'month' | 'week' | 'day',
  ): Promise<InboundSummaryResponse> {
    const startTime = Date.now();

    // Generate cache key
    const granularity = timeGranularity || 'month';
    const cacheKey = `${uploadId || 'latest'}-${fromDate || ''}-${toDate || ''}-${month || ''}-${productCategory || ''}-${granularity}`;
    
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
        select: { id: true }, // Only fetch id
      });

      if (!latestUpload) {
        throw new NotFoundException('No processed inbound uploads found');
      }

      targetUploadId = latestUpload.id;
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

    // Run parallel queries for metrics, dates, months, categories, and time series
    const [cards, availableDates, availableMonths, productCategories, timeSeries, summaryTotals] = await Promise.all([
      this.calculateCardMetricsOptimized(targetUploadId, effectiveFromDate, effectiveToDate, productCategory),
      this.getAvailableDates(targetUploadId),
      this.getAvailableMonths(targetUploadId),
      this.getProductCategories(targetUploadId),
      this.generateTimeSeries(targetUploadId, effectiveFromDate, effectiveToDate, productCategory, granularity),
      this.getSummaryTotals(targetUploadId, effectiveFromDate, effectiveToDate, productCategory),
    ]);

    const result: InboundSummaryResponse = {
      cards,
      availableDates,
      availableMonths: ['ALL', ...availableMonths],
      productCategories: ['ALL', ...productCategories],
      timeSeries,
      summaryTotals,
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(`Inbound getSummary: ${elapsed}ms`);

    return result;
  }

  /**
   * OPTIMIZATION: Calculate card metrics using SQL aggregation
   * Reduces data transfer from N rows to a single aggregated result
   */
  private async calculateCardMetricsOptimized(
    uploadId: string,
    fromDate?: string,
    toDate?: string,
    productCategory?: string,
  ): Promise<InboundCardMetrics> {
    // Build date filter
    let dateCondition = '';
    const params: any[] = [uploadId];
    
    if (fromDate) {
      params.push(new Date(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(new Date(toDate));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategory && productCategory !== 'ALL') {
      params.push(productCategory);
      dateCondition += ` AND item_group = $${params.length}`;
    }

    // Single query with all aggregations
    const result = await this.prisma.$queryRawUnsafe<[{
      invoice_sku_count: bigint;
      received_sku_count: bigint;
      invoice_qty_total: number;
      received_qty_total: number;
      good_qty_total: number;
      total_cbm: number;
    }]>(`
      SELECT 
        COUNT(DISTINCT invoice_sku) as invoice_sku_count,
        COUNT(DISTINCT received_sku) as received_sku_count,
        COALESCE(SUM(invoice_qty), 0) as invoice_qty_total,
        COALESCE(SUM(received_qty), 0) as received_qty_total,
        COALESCE(SUM(good_qty), 0) as good_qty_total,
        COALESCE(SUM(total_cbm), 0) as total_cbm
      FROM inbound_rows
      WHERE upload_id = $1 ${dateCondition}
    `, ...params);

    const row = result[0];
    return {
      invoiceSkuCount: Number(row?.invoice_sku_count || 0),
      receivedSkuCount: Number(row?.received_sku_count || 0),
      invoiceQtyTotal: Math.round(Number(row?.invoice_qty_total || 0) * 100) / 100,
      receivedQtyTotal: Math.round(Number(row?.received_qty_total || 0) * 100) / 100,
      goodQtyTotal: Math.round(Number(row?.good_qty_total || 0) * 100) / 100,
      totalCbm: Math.round(Number(row?.total_cbm || 0) * 100) / 100,
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

  private async getAvailableMonths(uploadId: string): Promise<string[]> {
    const rows = await this.prisma.inboundRow.findMany({
      where: { uploadId, dateOfUnload: { not: null } },
      select: { dateOfUnload: true },
      distinct: ['dateOfUnload'],
    });

    const months = new Set<string>();
    rows.forEach(row => {
      if (row.dateOfUnload) {
        const date = new Date(row.dateOfUnload);
        months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }
    });

    return Array.from(months).sort();
  }

  private async getProductCategories(uploadId: string): Promise<string[]> {
    const rows = await this.prisma.inboundRow.findMany({
      where: { uploadId },
      select: { itemGroup: true },
      distinct: ['itemGroup'],
    });

    return rows
      .map(r => r.itemGroup)
      .filter((g): g is string => g !== null)
      .sort();
  }

  private async generateTimeSeries(
    uploadId: string,
    fromDate?: string,
    toDate?: string,
    productCategory?: string,
    granularity: 'month' | 'week' | 'day' = 'month',
  ): Promise<TimeSeriesData> {
    // Build where clause
    const where: any = { uploadId };
    if (fromDate) {
      where.dateOfUnload = { ...where.dateOfUnload, gte: new Date(fromDate) };
    }
    if (toDate) {
      where.dateOfUnload = { ...where.dateOfUnload, lte: new Date(toDate) };
    }
    if (productCategory && productCategory !== 'ALL') {
      where.itemGroup = productCategory;
    }

    const rows = await this.prisma.inboundRow.findMany({
      where,
      select: { dateOfUnload: true, receivedQty: true, totalCbm: true },
    });

    const groupedData: { [key: string]: { receivedQty: number; totalCbm: number; dates: string[] } } = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    rows.forEach(row => {
      if (!row.dateOfUnload) return;
      const date = new Date(row.dateOfUnload);
      let bucketKey: string;

      switch (granularity) {
        case 'month':
          bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'week':
          const weekNum = this.getISOWeek(date);
          bucketKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          break;
        case 'day':
          bucketKey = date.toISOString().split('T')[0];
          break;
      }

      if (!groupedData[bucketKey]) {
        groupedData[bucketKey] = { receivedQty: 0, totalCbm: 0, dates: [] };
      }
      groupedData[bucketKey].receivedQty += row.receivedQty || 0;
      groupedData[bucketKey].totalCbm += row.totalCbm || 0;
      groupedData[bucketKey].dates.push(date.toISOString().split('T')[0]);
    });

    const points: TimeSeriesPoint[] = Object.keys(groupedData).sort().map(bucketKey => {
      const data = groupedData[bucketKey];
      let label: string;
      let startDate: string;
      let endDate: string;

      if (granularity === 'month') {
        const [year, month] = bucketKey.split('-');
        label = `${monthNames[parseInt(month) - 1]} ${year}`;
        startDate = `${bucketKey}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        endDate = `${bucketKey}-${String(lastDay).padStart(2, '0')}`;
      } else if (granularity === 'week') {
        label = bucketKey;
        const sortedDates = data.dates.sort();
        startDate = sortedDates[0] || bucketKey;
        endDate = sortedDates[sortedDates.length - 1] || bucketKey;
      } else {
        const date = new Date(bucketKey);
        label = `${date.getDate()} ${monthNames[date.getMonth()]}`;
        startDate = bucketKey;
        endDate = bucketKey;
      }

      return {
        key: bucketKey,
        label,
        receivedQty: Math.round(data.receivedQty * 100) / 100,
        totalCbm: Math.round(data.totalCbm * 100) / 100,
        startDate,
        endDate,
      };
    });

    return { granularity, points };
  }

  private async getSummaryTotals(
    uploadId: string,
    fromDate?: string,
    toDate?: string,
    productCategory?: string,
  ): Promise<SummaryTotals> {
    // Build SQL conditions similar to outbound summary totals
    let dateCondition = '';
    const params: any[] = [uploadId];

    if (fromDate) {
      params.push(new Date(fromDate));
      dateCondition += ` AND date_of_unload >= $${params.length}`;
    }
    if (toDate) {
      params.push(new Date(toDate));
      dateCondition += ` AND date_of_unload <= $${params.length}`;
    }
    if (productCategory && productCategory !== 'ALL') {
      params.push(productCategory);
      dateCondition += ` AND item_group = $${params.length}`;
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
        DATE(date_of_unload) as day_date,
        TO_CHAR(date_of_unload, 'YYYY-MM-DD') as day_label,
        COALESCE(SUM(received_qty), 0) as received_qty,
        COALESCE(SUM(total_cbm), 0) as total_cbm,
        COALESCE(SUM(CASE WHEN UPPER(item_group) LIKE '%EDEL%' THEN received_qty ELSE 0 END), 0) as edel_received_qty,
        COALESCE(SUM(CASE WHEN UPPER(item_group) LIKE '%EDEL%' THEN total_cbm ELSE 0 END), 0) as edel_total_cbm
      FROM inbound_rows
      WHERE upload_id = $1 
        AND date_of_unload IS NOT NULL
        ${dateCondition}
      GROUP BY DATE(date_of_unload), TO_CHAR(date_of_unload, 'YYYY-MM-DD')
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
   * Generate inbound summary Excel export
   */
  async generateSummaryExcel(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategory?: string,
  ): Promise<Buffer> {
    // Reuse existing summary pipeline (month filter handled inside getSummary)
    const summary = await this.getSummary(uploadId, fromDate, toDate, month, productCategory, 'month');

    const workbook = XLSX.utils.book_new();

    // Daily breakdown sheet
    const dayHeader = ['Date', 'Received Qty', 'Total CBM', 'EDEL Received Qty', 'EDEL CBM'];
    const dayRows = summary.summaryTotals.dayData.map((d) => [
      d.date,
      d.receivedQty,
      d.totalCbm,
      d.edelReceivedQty,
      d.edelTotalCbm,
    ]);

    const dayWs = XLSX.utils.aoa_to_sheet([
      dayHeader,
      ...dayRows,
    ]);
    XLSX.utils.book_append_sheet(workbook, dayWs, 'Daily Breakdown');

    // Overall totals sheet
    const totals = summary.summaryTotals;
    const totalsWsData = [
      ['Metric', 'Value'],
      ['Total Received Qty', totals.totalReceivedQty],
      ['Total CBM', totals.totalCbm],
      ['Total EDEL Received Qty', totals.totalEdelReceivedQty],
      ['Total EDEL CBM', totals.totalEdelTotalCbm],
    ];

    const totalsWs = XLSX.utils.aoa_to_sheet(totalsWsData);
    XLSX.utils.book_append_sheet(workbook, totalsWs, 'Summary Totals');

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  private getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
