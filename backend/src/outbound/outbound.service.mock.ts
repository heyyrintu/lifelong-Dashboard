import { Injectable } from '@nestjs/common';
import { CategoryNormalizerService } from './category-normalizer.service';
import { 
  classifyProductCategory, 
  ProductCategory, 
  PRODUCT_CATEGORY_LABELS, 
  PRODUCT_CATEGORY_ORDER, 
  productCategoryLabelToEnum 
} from './product-category.helper';
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
  key: string;           // e.g. "2025-01", "2025-W03", "2025-01-12"
  label: string;         // pretty label for x-axis: "Jan 2025", "W03", "12 Jan"
  dnQty: number;         // sum of delivery_note_qty
  dnTotalCbm: number;    // sum of dn_total_cbm
  startDate: string;     // ISO start of bucket
  endDate: string;       // ISO end of bucket
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
  dayData?: DayData[];
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

export interface UploadInfo {
  uploadId: string;
  fileName: string;
  uploadedAt: Date;
  rowsInserted: number;
  status: string;
}

@Injectable()
export class OutboundService {
  private mockData: any[] = [];
  private latestUploadId: string | null = null;
  private uploads: UploadInfo[] = [];

  constructor(private categoryNormalizer: CategoryNormalizerService) {}

  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    if (!file) {
      throw new Error('No file uploaded');
    }

    // Parse Excel file
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    // Validate data
    if (data.length < 2) {
      throw new Error('Excel file is empty or has no data');
    }

    // Generate upload ID
    const uploadId = 'mock-' + Date.now();
    this.latestUploadId = uploadId;

    // Process rows (skip header row)
    const rowsToInsert = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as any[];
      if (!row[2]) continue; // Skip empty rows

      const normalizedCategory = this.categoryNormalizer.normalizeCategory(row[2] as string);
      const productCategory = classifyProductCategory(row[12] as string);

      rowsToInsert.push({
        upload_id: uploadId,
        customer_group: row[2] || null,
        source_warehouse: row[10] || null,
        so_item: row[11] || null,
        category_raw: row[12] || null,
        sales_order_qty: row[13] ? parseFloat(row[13]) : 0,
        so_total_cbm: row[15] ? parseFloat(row[15]) : 0,
        delivery_note_date: this.parseDate(row[18]),
        delivery_note_item: row[20] || null,
        delivery_note_qty: row[21] ? parseFloat(row[21]) : 0,
        dn_total_cbm: row[22] ? parseFloat(row[22]) : 0,
        transporter: row[23] || null,
        normalized_category: normalizedCategory,
        product_category: productCategory,
      });
    }

    // Store in memory
    this.mockData = [...this.mockData, ...rowsToInsert];

    // Store upload metadata
    const uploadInfo: UploadInfo = {
      uploadId,
      fileName: file.originalname,
      uploadedAt: new Date(),
      rowsInserted: rowsToInsert.length,
      status: 'processed',
    };
    this.uploads.push(uploadInfo);

    return {
      uploadId,
      rowsInserted: rowsToInsert.length,
    };
  }

  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategory?: string,
    timeGranularity?: string
  ): Promise<SummaryResponse> {
    // Filter data based on parameters
    let filteredData = this.mockData.filter(row => row.delivery_note_date);

    if (uploadId) {
      filteredData = filteredData.filter(row => row.upload_id === uploadId);
    } else if (month && month !== 'ALL') {
      const [year, monthNum] = month.split('-');
      filteredData = filteredData.filter(row => {
        const date = new Date(row.delivery_note_date);
        return date.getFullYear() === parseInt(year) && 
               date.getMonth() + 1 === parseInt(monthNum);
      });
    } else if (fromDate || toDate) {
      filteredData = filteredData.filter(row => {
        const rowDate = new Date(row.delivery_note_date);
        const fromDateObj = fromDate ? new Date(fromDate) : null;
        const toDateObj = toDate ? new Date(toDate) : null;
        
        // Set time to start/end of day for inclusive filtering
        if (fromDateObj) fromDateObj.setHours(0, 0, 0, 0);
        if (toDateObj) toDateObj.setHours(23, 59, 59, 999);
        
        let matches = true;
        if (fromDateObj && rowDate < fromDateObj) matches = false;
        if (toDateObj && rowDate > toDateObj) matches = false;
        
        return matches;
      });
    }

    // Separate data for product category filtering
    let productCategoryFilteredData = filteredData;
    if (productCategory && productCategory !== 'ALL') {
      const enumValue = productCategoryLabelToEnum(productCategory);
      if (enumValue) {
        productCategoryFilteredData = filteredData.filter(row => row.product_category === enumValue);
      }
    }

    // Calculate cards from product category filtered data
    const cards: CardMetrics = {
      soSku: new Set(productCategoryFilteredData.filter(r => r.so_item).map(r => r.so_item)).size,
      soQty: productCategoryFilteredData.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
      soTotalCbm: productCategoryFilteredData.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
      dnSku: new Set(productCategoryFilteredData.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
      dnQty: productCategoryFilteredData.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      dnTotalCbm: productCategoryFilteredData.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      soMinusDnQty: productCategoryFilteredData.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
    };

    // Group by category (Customer Group) - using ALL filtered data (not product category filtered)
    const categoryGroups: { [key: string]: any[] } = {};
    filteredData.forEach(row => {
      const category = row.normalized_category || 'OTHERS';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(row);
    });

    // Define fixed order for customer groups
    const CUSTOMER_GROUP_ORDER = ['E_COMMERCE', 'OFFLINE', 'QUICK_COMMERCE', 'EBO', 'B2C', 'OTHERS'];

    // Build category table with all groups in fixed order
    const categoryTable: CategoryRow[] = CUSTOMER_GROUP_ORDER.map(category => {
      const rows = categoryGroups[category] || [];
      return {
        categoryLabel: this.getCategoryLabel(category),
        soCount: new Set(rows.filter(r => r.so_item).map(r => r.so_item)).size,
        soQty: rows.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
        soTotalCbm: rows.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
        dnCount: new Set(rows.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
        dnQty: rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
        dnTotalCbm: rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
        soMinusDnQty: rows.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
      };
    });

    // Add TOTAL row for category table
    const categoryTotalRow: CategoryRow = {
      categoryLabel: 'TOTAL',
      soCount: new Set(filteredData.filter(r => r.so_item).map(r => r.so_item)).size,
      soQty: filteredData.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
      soTotalCbm: filteredData.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
      dnCount: new Set(filteredData.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
      dnQty: filteredData.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      dnTotalCbm: filteredData.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      soMinusDnQty: filteredData.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
    };
    categoryTable.push(categoryTotalRow);

    // Build product category table - using product category filtered data
    const productCategoryGroups: Record<string, any[]> = {};
    PRODUCT_CATEGORY_ORDER.forEach(cat => {
      productCategoryGroups[cat] = [];
    });

    productCategoryFilteredData.forEach(row => {
      const cat = row.product_category || ProductCategory.OTHERS;
      if (!productCategoryGroups[cat]) {
        productCategoryGroups[cat] = [];
      }
      productCategoryGroups[cat].push(row);
    });

    const productCategoryTable: CategoryRow[] = PRODUCT_CATEGORY_ORDER.map(cat => {
      const rows = productCategoryGroups[cat] || [];
      return {
        categoryLabel: PRODUCT_CATEGORY_LABELS[cat],
        soCount: new Set(rows.filter(r => r.so_item).map(r => r.so_item)).size,
        soQty: rows.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
        soTotalCbm: rows.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
        dnCount: new Set(rows.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
        dnQty: rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
        dnTotalCbm: rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
        soMinusDnQty: rows.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
      };
    });

    // Add TOTAL row for product category table
    const productCategoryTotalRow: CategoryRow = {
      categoryLabel: 'TOTAL',
      soCount: new Set(productCategoryFilteredData.filter(r => r.so_item).map(r => r.so_item)).size,
      soQty: productCategoryFilteredData.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
      soTotalCbm: productCategoryFilteredData.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
      dnCount: new Set(productCategoryFilteredData.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
      dnQty: productCategoryFilteredData.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      dnTotalCbm: productCategoryFilteredData.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      soMinusDnQty: productCategoryFilteredData.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
    };
    productCategoryTable.push(productCategoryTotalRow);

    // Get available months
    const months = new Set<string>();
    this.mockData.forEach(row => {
      if (row.delivery_note_date) {
        const date = new Date(row.delivery_note_date);
        months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    const availableMonths = ['ALL', ...Array.from(months).sort().reverse()];

    // Product categories list
    const productCategories = ['ALL', ...PRODUCT_CATEGORY_ORDER.map(cat => PRODUCT_CATEGORY_LABELS[cat])];

    // Generate time series data with specified granularity
    // When month is selected, use filteredData (without product category filter) for charts
    // Otherwise, use productCategoryFilteredData (with product category filter)
    const granularity = (timeGranularity as 'month' | 'week' | 'day') || 'month';
    const timeSeriesData = (month && month !== 'ALL') ? filteredData : productCategoryFilteredData;
    const timeSeries = this.generateTimeSeries(timeSeriesData, granularity);

    // Calculate summary totals
    // When month is selected, use filteredData (without product category filter)
    // Otherwise, use productCategoryFilteredData (with product category filter)
    const summaryDataForTotals = (month && month !== 'ALL') ? filteredData : productCategoryFilteredData;
    
    // Generate day-by-day data for summary totals
    const dayDataMap: { [key: string]: any[] } = {};
    summaryDataForTotals.forEach(row => {
      if (row.delivery_note_date) {
        const dateKey = new Date(row.delivery_note_date).toISOString().split('T')[0];
        if (!dayDataMap[dateKey]) {
          dayDataMap[dateKey] = [];
        }
        dayDataMap[dateKey].push(row);
      }
    });

    // Create sorted day data array
    const dayDataArray: DayData[] = Object.keys(dayDataMap)
      .sort()
      .map(dateKey => {
        const rows = dayDataMap[dateKey];
        const date = new Date(dateKey);
        const dayNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        return {
          date: dateKey,
          label: `${date.getDate()} ${dayNames[date.getMonth()]}`,
          dnQty: rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
          dnCbm: rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
          edelDnQty: rows
            .filter(r => r.product_category === 'EDEL')
            .reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
          edelDnCbm: rows
            .filter(r => r.product_category === 'EDEL')
            .reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
        };
      });

    const summaryTotals: SummaryTotals = {
      totalDnQty: summaryDataForTotals.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      totalDnCbm: summaryDataForTotals.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      totalEdelDnQty: summaryDataForTotals
        .filter(r => r.product_category === 'EDEL')
        .reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      totalEdelDnCbm: summaryDataForTotals
        .filter(r => r.product_category === 'EDEL')
        .reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      dayData: dayDataArray,
    };

    return {
      cards,
      categoryTable,
      productCategoryTable,
      availableMonths,
      productCategories,
      timeSeries,
      summaryTotals,
    };
  }

  private parseDate(dateValue: any): string | null {
    if (!dateValue) return null;
    
    if (typeof dateValue === 'number') {
      // Excel date number
      const date = new Date((dateValue - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    
    if (typeof dateValue === 'string') {
      // Try to parse as date string
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    return null;
  }

  private getCategoryLabel(category: string): string {
    const labels: { [key: string]: string } = {
      B2C: 'B2C',
      E_COMMERCE: 'E-Commerce',
      QUICK_COMMERCE: 'Quick-Commerce',
      OFFLINE: 'Offline',
      EBO: 'EBO',
      OTHERS: 'Others',
    };
    return labels[category] || category;
  }

  async getUploads(): Promise<UploadInfo[]> {
    return this.uploads.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async deleteUpload(uploadId: string): Promise<void> {
    // Remove upload metadata
    const uploadIndex = this.uploads.findIndex(u => u.uploadId === uploadId);
    if (uploadIndex === -1) {
      throw new Error('Upload not found');
    }
    this.uploads.splice(uploadIndex, 1);

    // Remove all data associated with this upload
    this.mockData = this.mockData.filter(row => row.upload_id !== uploadId);
  }

  private generateTimeSeries(data: any[], granularity: 'month' | 'week' | 'day'): TimeSeriesData {
    const points: TimeSeriesPoint[] = [];
    const groupedData: { [key: string]: any[] } = {};

    // Group data by time bucket
    data.forEach(row => {
      if (!row.delivery_note_date) {
        return;
      }
      
      const date = new Date(row.delivery_note_date);
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
        groupedData[bucketKey] = [];
      }
      groupedData[bucketKey].push(row);
    });

    // Generate time series points based on granularity
    if (granularity === 'day' && data.length > 0) {
      // For day granularity, show ALL days in the month range
      const dates = data.map(row => new Date(row.delivery_note_date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      // If dates are in the same month, show all days of that month
      if (minDate.getFullYear() === maxDate.getFullYear() && minDate.getMonth() === maxDate.getMonth()) {
        const year = minDate.getFullYear();
        const month = minDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Generate all days of the month
        for (let day = 1; day <= daysInMonth; day++) {
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const rows = groupedData[dateKey] || [];
          const dnQty = rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0);
          const dnTotalCbm = rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0);
          
          const date = new Date(year, month, day);
          const dayNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          
          points.push({
            key: dateKey,
            label: `${day} ${dayNames[month]}`,
            dnQty,
            dnTotalCbm,
            startDate: dateKey,
            endDate: dateKey,
          });
        }
      } else {
        // If dates span multiple months, show all existing days (original behavior)
        Object.keys(groupedData).sort().forEach(key => {
          const rows = groupedData[key];
          const dnQty = rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0);
          const dnTotalCbm = rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0);
          
          const { startDate, endDate, label } = this.getTimeBucketInfo(key, granularity);
          
          points.push({
            key,
            label,
            dnQty,
            dnTotalCbm,
            startDate,
            endDate,
          });
        });
      }
    } else {
      // For month and week granularity, use original behavior
      Object.keys(groupedData).sort().forEach(key => {
        const rows = groupedData[key];
        const dnQty = rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0);
        const dnTotalCbm = rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0);
        
        const { startDate, endDate, label } = this.getTimeBucketInfo(key, granularity);
        
        points.push({
          key,
          label,
          dnQty,
          dnTotalCbm,
          startDate,
          endDate,
        });
      });
    }

    return {
      granularity,
      points,
    };
  }

  private getISOWeek(date: Date): number {
    const tempDate = new Date(date.valueOf());
    // ISO week: Thursday of the current week determines the year
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    return 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  private getTimeBucketInfo(key: string, granularity: 'month' | 'week' | 'day'): { startDate: string; endDate: string; label: string } {
    switch (granularity) {
      case 'month':
        const [year, month] = key.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // Last day of month
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          label: `${monthNames[month - 1]} ${year}`,
        };
      
      case 'week':
        const [weekYear, weekNum] = key.split('-W').map(Number);
        const weekStart = this.getWeekStart(weekYear, weekNum);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        return {
          startDate: weekStart.toISOString().split('T')[0],
          endDate: weekEnd.toISOString().split('T')[0],
          label: `W${String(weekNum).padStart(2, '0')}`,
        };
      
      case 'day':
        const dayDate = new Date(key);
        return {
          startDate: key,
          endDate: key,
          label: `${dayDate.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dayDate.getMonth()]}`,
        };
    }
  }

  private getWeekStart(year: number, week: number): Date {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - firstDayOfYear.getDay();
    return new Date(year, 0, 1 + daysOffset);
  }

  async generateSummaryExcel(summaryTotals: SummaryTotals): Promise<Buffer> {
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create summary data
    const summaryData = [
      ['Metric', 'Value'],
      ['Total DN Qty', summaryTotals.totalDnQty],
      ['Total DN CBM', summaryTotals.totalDnCbm],
      ['Total EDEL DN Qty', summaryTotals.totalEdelDnQty],
      ['Total EDEL DN CBM', summaryTotals.totalEdelDnCbm],
    ];
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Style the worksheet (basic styling)
    worksheet['A1'].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'FFE6E6' } }
    };
    worksheet['B1'].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'FFE6E6' } }
    };
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 20 }, // Metric column
      { width: 15 }, // Value column
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary');
    
    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async generateDetailedExcel(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategory?: string
  ): Promise<Buffer> {
    // Get summary data 
    const summary = await this.getSummary(uploadId, fromDate, toDate, month, productCategory);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create monthly summary data
    const monthlyData = [
      ['Metric', 'Value']
    ];
    
    // Add summary totals
    monthlyData.push(['Total DN Qty', summary.summaryTotals.totalDnQty.toString()]);
    monthlyData.push(['Total DN CBM', summary.summaryTotals.totalDnCbm.toString()]);
    monthlyData.push(['Total EDEL DN Qty', summary.summaryTotals.totalEdelDnQty.toString()]);
    monthlyData.push(['Total EDEL DN CBM', summary.summaryTotals.totalEdelDnCbm.toString()]);
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(monthlyData);
    
    // Style the header row
    for (let col = 0; col < monthlyData[0].length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      worksheet[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'FFE6E6' } }
      };
    }
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 20 }, // Metric column
      { width: 15 }, // Value column
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Summary');
    
    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
