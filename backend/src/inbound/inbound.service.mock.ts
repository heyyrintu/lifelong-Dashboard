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

      // Store in memory
      this.itemMasterData = [...this.itemMasterData, ...rowsToProcess];
      
      console.log(`Item Master: Loaded ${rowsToProcess.length} items`);
      console.log('Sample item:', rowsToProcess[0]);

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
      throw new Error(`Failed to process Item Master Excel file: ${error.message}`);
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
        
        // Look up CBM from Item Master data (compare as strings)
        const itemMaster = this.itemMasterData.find(im => im.item_code === itemCode);
        const cbmPerUnit = itemMaster?.cbm || 0;
        const totalCbm = cbmPerUnit * receivedQty;
        
        rowsToInsert.push({
          upload_id: uploadId,
          item_code: itemCode,
          item_name: itemMaster?.item_name || row[2] || null, // From Item Master or Supplier Name
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
      throw new Error(`Failed to process Inbound Excel file: ${error.message}`);
    }
  }

  async getSummary(
    uploadId?: string,
    fromDate?: string,
    toDate?: string
  ): Promise<any> {
    // Use all data, not just those with received_date
    let filteredData = [...this.mockData];

    if (uploadId) {
      filteredData = filteredData.filter(row => row.upload_id === uploadId);
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
}
