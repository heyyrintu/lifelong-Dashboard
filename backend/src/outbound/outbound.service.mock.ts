import { Injectable } from '@nestjs/common';
import { CategoryNormalizerService } from './category-normalizer.service';
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
    month?: string
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

    // Calculate cards
    const cards: CardMetrics = {
      soSku: new Set(filteredData.filter(r => r.so_item).map(r => r.so_item)).size,
      soQty: filteredData.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
      soTotalCbm: filteredData.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
      dnSku: new Set(filteredData.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
      dnQty: filteredData.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      dnTotalCbm: filteredData.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      soMinusDnQty: filteredData.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
    };

    // Group by category
    const categoryGroups: { [key: string]: any[] } = {};
    filteredData.forEach(row => {
      const category = row.normalized_category || 'OTHERS';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(row);
    });

    // Build category table
    const categoryTable: CategoryRow[] = Object.entries(categoryGroups).map(([category, rows]) => ({
      categoryLabel: this.getCategoryLabel(category),
      soCount: new Set(rows.filter(r => r.so_item).map(r => r.so_item)).size,
      soQty: rows.reduce((sum, r) => sum + (r.sales_order_qty || 0), 0),
      soTotalCbm: rows.reduce((sum, r) => sum + (r.so_total_cbm || 0), 0),
      dnCount: new Set(rows.filter(r => r.delivery_note_item).map(r => r.delivery_note_item)).size,
      dnQty: rows.reduce((sum, r) => sum + (r.delivery_note_qty || 0), 0),
      dnTotalCbm: rows.reduce((sum, r) => sum + (r.dn_total_cbm || 0), 0),
      soMinusDnQty: rows.reduce((sum, r) => sum + ((r.sales_order_qty || 0) - (r.delivery_note_qty || 0)), 0),
    }));

    // Add TOTAL row
    const totalRow: CategoryRow = {
      categoryLabel: 'TOTAL',
      soCount: categoryTable.reduce((sum, row) => sum + row.soCount, 0),
      soQty: categoryTable.reduce((sum, row) => sum + row.soQty, 0),
      soTotalCbm: categoryTable.reduce((sum, row) => sum + row.soTotalCbm, 0),
      dnCount: categoryTable.reduce((sum, row) => sum + row.dnCount, 0),
      dnQty: categoryTable.reduce((sum, row) => sum + row.dnQty, 0),
      dnTotalCbm: categoryTable.reduce((sum, row) => sum + row.dnTotalCbm, 0),
      soMinusDnQty: categoryTable.reduce((sum, row) => sum + row.soMinusDnQty, 0),
    };

    categoryTable.push(totalRow);

    // Get available months
    const months = new Set<string>();
    this.mockData.forEach(row => {
      if (row.delivery_note_date) {
        const date = new Date(row.delivery_note_date);
        months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    const availableMonths = ['ALL', ...Array.from(months).sort().reverse()];

    return {
      cards,
      categoryTable,
      availableMonths,
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
}
