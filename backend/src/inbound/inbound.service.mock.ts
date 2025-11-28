import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export interface ItemMasterUploadResult {
  uploadId: string;
  rowsProcessed: number;
  message: string;
}

export interface InboundUploadResult {
  uploadId: string;
  rowsInserted: number;
}

export interface UploadInfo {
  uploadId: string;
  fileName: string;
  uploadedAt: Date;
  rowsInserted: number;
  status: string;
  type: 'item-master' | 'inbound';
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
}

export interface SummaryTotals {
  totalReceivedQty: number;
  totalCbm: number;
  dayData: DayData[];
}

@Injectable()
export class InboundServiceMock {
  private mockData: any[] = [];
  private itemMasterData: any[] = [];
  private latestUploadId: string | null = null;
  private uploads: UploadInfo[] = [];

  /**
   * Parse and store Item Master Excel file
   */
  async uploadItemMaster(filePath: string, fileName: string): Promise<ItemMasterUploadResult> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }

      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      console.log('Item Master sheets:', workbook.SheetNames);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Log header row
      console.log('Item Master Header row:', data[0]);

      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.warn('Could not delete uploaded file:', unlinkError);
      }

      // Validate data
      if (data.length < 2) {
        throw new Error('Excel file is empty or has no data');
      }

      // Generate upload ID
      const uploadId = 'item-master-' + Date.now();

      // Column mapping for Item Master:
      // 0: Sr, 1: ID (item_code), 2: Item Name, 3: Item Group
      // 4: Length, 5: Breadth, 6: Height, 7: CBM
      // 8: Ref Code, 9: Net Weight, 10: Gross Weight, 11: Sub Category
      const rowsToProcess = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row[1]) continue; // Skip rows without ID

        rowsToProcess.push({
          item_code: String(row[1] || '').trim(), // ID column - convert to string for matching
          item_name: row[2] || null,              // Item Name
          category: row[3] || null,               // Item Group
          cbm: this.parseNumber(row[7]),          // CBM column
          weight: this.parseNumber(row[10]),      // Gross Weight Per Unit
        });
      }

      // Store in memory (replace existing data)
      this.itemMasterData = rowsToProcess;
      
      console.log(`Item Master: Loaded ${rowsToProcess.length} items`);
      console.log('Sample item:', rowsToProcess[0]);

      // Recalculate CBM for existing inbound data
      this.recalculateCbm();

      // Store upload metadata
      const uploadInfo: UploadInfo = {
        uploadId,
        fileName,
        uploadedAt: new Date(),
        rowsInserted: rowsToProcess.length,
        status: 'processed',
        type: 'item-master',
      };
      this.uploads.push(uploadInfo);

      return {
        uploadId,
        rowsProcessed: rowsToProcess.length,
        message: 'Item Master processed successfully',
      };
    } catch (error) {
      console.error('Error processing Item Master Excel file:', error);
      const message = this.safeErrorMessage(error);
      throw new Error(`Failed to process Item Master Excel file: ${message}`);
    }
  }

  /**
   * Parse and store Inbound Excel file
   */
  async uploadInbound(filePath: string, fileName: string): Promise<InboundUploadResult> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }

      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      
      // Look for "MIS- Fresh Receipt" sheet, fallback to first sheet
      const targetSheetName = 'MIS- Fresh Receipt';
      let sheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().includes('fresh receipt') || name === targetSheetName
      );
      
      if (!sheetName) {
        console.log('Available sheets:', workbook.SheetNames);
        sheetName = workbook.SheetNames[0];
        console.log(`"${targetSheetName}" sheet not found, using: ${sheetName}`);
      } else {
        console.log(`Using sheet: ${sheetName}`);
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Row 0 is title/empty, Row 1 is header, Data starts from Row 2
      const headerRow = data[1] as any[];
      console.log('Header row (row 2):', headerRow);

      // Create upload record
      const uploadId = 'inbound-mock-' + Date.now();
      this.latestUploadId = uploadId;

      // Process rows (skip first row and header row, start from row index 2)
      const rowsToInsert = [];
      for (let i = 2; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || !row[0]) continue; // Skip empty rows

        // Column mapping for MIS- Fresh Receipt sheet:
        // 0: Sr No, 1: Date of Unload, 2: Supplier Name, 3: Transporter Name
        // 4: Vehicle No, 5: LR No, 6: Invoice No, 7: PO Number
        // 8: Invoice SKU, 9: Received SKU, 10: Invoice Qty, 11: Received Qty
        // 12: MC Box, 13: Good, 14: Difference, 15: BAD
        const itemCode = String(row[9] || row[8] || '').trim(); // Received SKU or Invoice SKU
        const invoiceQty = this.parseNumber(row[10]);
        const receivedQty = this.parseNumber(row[11]);
        const goodQty = this.parseNumber(row[13]);
        const receivedDate = this.parseDate(row[1]); // Date of Unload
        
        // Look up CBM and Category from Item Master data (compare as strings)
        const itemMaster = this.itemMasterData.find(im => im.item_code === itemCode);
        const cbmPerUnit = itemMaster?.cbm || 0;
        const totalCbm = cbmPerUnit * receivedQty;
        const category = itemMaster?.category || 'Uncategorized';
        
        rowsToInsert.push({
          upload_id: uploadId,
          item_code: itemCode,
          item_name: itemMaster?.item_name || row[2] || null, // From Item Master or Supplier Name
          category: category, // Product Category from Item Master (Item Group)
          invoice_qty: invoiceQty,
          received_qty: receivedQty,
          good_qty: goodQty,
          cbm: totalCbm,
          received_date: receivedDate,
        });
      }

      const matchedCount = rowsToInsert.filter(r => r.cbm > 0).length;
      console.log(`Parsed ${rowsToInsert.length} rows, ${matchedCount} matched with Item Master (have CBM)`);
      console.log('Sample row:', rowsToInsert[0]);
      console.log('Item Master has', this.itemMasterData.length, 'items');

      // Store in memory
      this.mockData = [...this.mockData, ...rowsToInsert];

      // Store upload metadata
      const uploadInfo: UploadInfo = {
        uploadId,
        fileName,
        uploadedAt: new Date(),
        rowsInserted: rowsToInsert.length,
        status: 'processed',
        type: 'inbound',
      };
      this.uploads.push(uploadInfo);

      // Clean up file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.warn('Could not delete uploaded file:', unlinkError);
      }

      return {
        uploadId,
        rowsInserted: rowsToInsert.length,
      };
    } catch (error) {
      console.error('Error processing Inbound Excel file:', error);
      const message = this.safeErrorMessage(error);
      throw new Error(`Failed to process Inbound Excel file: ${message}`);
    }
  }

  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string,
    month?: string,
    productCategory?: string,
    timeGranularity?: 'month' | 'week' | 'day'
  ): Promise<any> {
    // Use all data, not just those with received_date
    let filteredData = [...this.mockData];

    if (uploadId) {
      filteredData = filteredData.filter(row => row.upload_id === uploadId);
    } else if (month && month !== 'ALL') {
      // Filter by month (YYYY-MM format)
      filteredData = filteredData.filter(row => {
        if (!row.received_date) return false;
        return row.received_date.startsWith(month);
      });
    } else if (fromDate || toDate) {
      filteredData = filteredData.filter(row => {
        if (!row.received_date) return true; // Include rows without date
        const rowDate = new Date(row.received_date);
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

    // Filter by product category
    if (productCategory && productCategory !== 'ALL') {
      filteredData = filteredData.filter(row => row.category === productCategory);
    }

    // Calculate summary metrics matching frontend expectations
    const uniqueInvoiceSkus = new Set(filteredData.filter(r => r.invoice_qty > 0).map(r => r.item_code));
    const uniqueReceivedSkus = new Set(filteredData.filter(r => r.received_qty > 0).map(r => r.item_code));
    
    const invoiceSkuCount = uniqueInvoiceSkus.size;
    const receivedSkuCount = uniqueReceivedSkus.size;
    const invoiceQtyTotal = filteredData.reduce((sum, r) => sum + (r.invoice_qty || 0), 0);
    const receivedQtyTotal = filteredData.reduce((sum, r) => sum + (r.received_qty || 0), 0);
    const goodQtyTotal = filteredData.reduce((sum, r) => sum + (r.good_qty || 0), 0);
    const totalCbm = filteredData.reduce((sum, r) => sum + (r.cbm || 0), 0);

    // Get available date range
    const dates = filteredData
      .filter(r => r.received_date)
      .map(r => r.received_date)
      .sort();
    
    const minDate = dates.length > 0 ? dates[0] : null;
    const maxDate = dates.length > 0 ? dates[dates.length - 1] : null;

    // Get available months (from all data, not just filtered)
    const allMonths = new Set(
      this.mockData
        .filter(r => r.received_date)
        .map(r => r.received_date.substring(0, 7)) // YYYY-MM
    );
    const availableMonths = ['ALL', ...Array.from(allMonths).sort()];

    // Get product categories (from all data, not just filtered)
    const allCategories = new Set(
      this.mockData
        .filter(r => r.category)
        .map(r => r.category)
    );
    const productCategories = ['ALL', ...Array.from(allCategories).sort()];

    // Generate time series data
    const granularity = timeGranularity || 'month';
    const timeSeries = this.generateTimeSeries(filteredData, granularity);

    // Generate day-by-day data for summary totals
    const dayDataMap: { [key: string]: any[] } = {};
    filteredData.forEach(row => {
      if (row.received_date) {
        const dateKey = row.received_date;
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
          receivedQty: rows.reduce((sum, r) => sum + (r.received_qty || 0), 0),
          totalCbm: rows.reduce((sum, r) => sum + (r.cbm || 0), 0),
        };
      });

    const summaryTotals: SummaryTotals = {
      totalReceivedQty: filteredData.reduce((sum, r) => sum + (r.received_qty || 0), 0),
      totalCbm: filteredData.reduce((sum, r) => sum + (r.cbm || 0), 0),
      dayData: dayDataArray,
    };

    return {
      cards: {
        invoiceSkuCount,
        receivedSkuCount,
        invoiceQtyTotal,
        receivedQtyTotal,
        goodQtyTotal,
        totalCbm,
      },
      availableDates: {
        minDate,
        maxDate,
      },
      availableMonths,
      productCategories,
      timeSeries,
      summaryTotals,
      data: filteredData,
      availableUploads: this.uploads,
    };
  }

  /**
   * Get all uploads (both item-master and inbound)
   */
  async getUploads(): Promise<UploadInfo[]> {
    return this.uploads.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  /**
   * Recalculate CBM for all existing inbound data using current Item Master
   */
  private recalculateCbm(): void {
    if (this.mockData.length === 0 || this.itemMasterData.length === 0) {
      return;
    }

    console.log('Recalculating CBM for', this.mockData.length, 'inbound rows...');
    
    let updatedCount = 0;
    this.mockData = this.mockData.map(row => {
      const itemMaster = this.itemMasterData.find(im => im.item_code === row.item_code);
      if (itemMaster) {
        const cbmPerUnit = itemMaster.cbm || 0;
        const totalCbm = cbmPerUnit * (row.received_qty || 0);
        const category = itemMaster.category || 'Uncategorized';
        
        if (totalCbm > 0) updatedCount++;
        
        return {
          ...row,
          cbm: totalCbm,
          category: category,
        };
      }
      return row;
    });

    console.log(`CBM recalculated: ${updatedCount} rows now have CBM values`);
  }

  private generateTimeSeries(data: any[], granularity: 'month' | 'week' | 'day'): TimeSeriesData {
    const points: TimeSeriesPoint[] = [];
    const groupedData: { [key: string]: any[] } = {};

    // Group data by time bucket
    data.forEach(row => {
      if (!row.received_date) return;
      
      const date = new Date(row.received_date);
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
      const dates = data.filter(row => row.received_date).map(row => new Date(row.received_date));
      if (dates.length > 0) {
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
            const receivedQty = rows.reduce((sum, r) => sum + (r.received_qty || 0), 0);
            const totalCbm = rows.reduce((sum, r) => sum + (r.cbm || 0), 0);
            
            const dayNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            points.push({
              key: dateKey,
              label: `${day} ${dayNames[month]}`,
              receivedQty,
              totalCbm,
              startDate: dateKey,
              endDate: dateKey,
            });
          }
        } else {
          // If dates span multiple months, show all existing days
          Object.keys(groupedData).sort().forEach(dateKey => {
            const rows = groupedData[dateKey];
            const receivedQty = rows.reduce((sum, r) => sum + (r.received_qty || 0), 0);
            const totalCbm = rows.reduce((sum, r) => sum + (r.cbm || 0), 0);
            
            const date = new Date(dateKey);
            const dayNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            points.push({
              key: dateKey,
              label: `${date.getDate()} ${dayNames[date.getMonth()]}`,
              receivedQty,
              totalCbm,
              startDate: dateKey,
              endDate: dateKey,
            });
          });
        }
      }
    } else {
      // For month and week granularity
      Object.keys(groupedData).sort().forEach(bucketKey => {
        const rows = groupedData[bucketKey];
        const receivedQty = rows.reduce((sum, r) => sum + (r.received_qty || 0), 0);
        const totalCbm = rows.reduce((sum, r) => sum + (r.cbm || 0), 0);
        
        let label: string;
        let startDate: string;
        let endDate: string;
        
        if (granularity === 'month') {
          const [year, month] = bucketKey.split('-');
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          label = `${monthNames[parseInt(month) - 1]} ${year}`;
          startDate = `${bucketKey}-01`;
          const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
          endDate = `${bucketKey}-${String(lastDay).padStart(2, '0')}`;
        } else {
          // Week
          label = bucketKey;
          const dates = rows.map(r => r.received_date).sort();
          startDate = dates[0] || bucketKey;
          endDate = dates[dates.length - 1] || bucketKey;
        }
        
        points.push({
          key: bucketKey,
          label,
          receivedQty,
          totalCbm,
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
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private parseNumber(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(num) ? 0 : num;
  }

  private parseDate(dateValue: any): string | null {
    if (!dateValue) return null;
    
    try {
      if (typeof dateValue === 'number') {
        // Excel date number (days since 1900-01-01)
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      
      if (typeof dateValue === 'string') {
        // Handle common date formats
        // DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = dateValue.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (ddmmyyyy) {
          const [, day, month, year] = ddmmyyyy;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
        
        // YYYY-MM-DD (ISO format)
        const isoFormat = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoFormat) {
          return dateValue;
        }
        
        // Try standard Date parsing as fallback
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      
      // Handle Date object
      if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        return dateValue.toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('Failed to parse date:', dateValue, error);
    }
    
    return null;
  }

  private safeErrorMessage(error: unknown): string {
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
}
