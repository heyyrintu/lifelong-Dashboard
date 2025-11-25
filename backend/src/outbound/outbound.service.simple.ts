import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryNormalizerService } from './category-normalizer.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { Pool } from 'pg';

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
  private pool: Pool;

  constructor(private categoryNormalizer: CategoryNormalizerService) {
    this.pool = new Pool({
      user: 'postgres',
      host: '127.0.0.1',
      database: 'lifelong_dashboard',
      port: 5432,
      password: 'postgres', // Try with password again
      ssl: false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }

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

    // Create upload record
    const uploadResult = await this.pool.query(
      `INSERT INTO outbound_uploads (file_name, uploaded_at, status, source) 
       VALUES ($1, NOW(), 'processed', 'manual-upload') 
       RETURNING id`,
      [file.originalname]
    );
    const uploadId = uploadResult.rows[0].id;

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

    // Bulk insert
    if (rowsToInsert.length > 0) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of rowsToInsert) {
          await client.query(`
            INSERT INTO outbound_rows (
              upload_id, customer_group, source_warehouse, so_item, category_raw,
              sales_order_qty, so_total_cbm, delivery_note_date, delivery_note_item,
              delivery_note_qty, dn_total_cbm, transporter, normalized_category
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
          `, Object.values(row));
        }
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }

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
    // Build WHERE clause
    const conditions = ['delivery_note_date IS NOT NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (uploadId) {
      conditions.push(`upload_id = $${paramIndex++}`);
      params.push(uploadId);
    } else if (month && month !== 'ALL') {
      const [year, monthNum] = month.split('-');
      conditions.push(`EXTRACT(YEAR FROM delivery_note_date) = $${paramIndex++}`);
      conditions.push(`EXTRACT(MONTH FROM delivery_note_date) = $${paramIndex++}`);
      params.push(parseInt(year), parseInt(monthNum));
    } else if (fromDate && toDate) {
      conditions.push(`delivery_note_date >= $${paramIndex++}`);
      conditions.push(`delivery_note_date <= $${paramIndex++}`);
      params.push(fromDate, toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get cards data
    const cardsQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN so_item IS NOT NULL THEN so_item END) as soSku,
        COALESCE(SUM(sales_order_qty), 0) as soQty,
        COALESCE(SUM(so_total_cbm), 0) as soTotalCbm,
        COUNT(DISTINCT CASE WHEN delivery_note_item IS NOT NULL THEN delivery_note_item END) as dnSku,
        COALESCE(SUM(delivery_note_qty), 0) as dnQty,
        COALESCE(SUM(dn_total_cbm), 0) as dnTotalCbm,
        COALESCE(SUM(sales_order_qty) - SUM(delivery_note_qty), 0) as soMinusDnQty
      FROM outbound_rows 
      ${whereClause}
    `;

    const cardsResult = await this.pool.query(cardsQuery, params);
    const cards = cardsResult.rows[0];

    // Get category table data
    const categoryQuery = `
      SELECT 
        normalized_category as normalizedCategory,
        COUNT(CASE WHEN so_item IS NOT NULL THEN 1 END) as soCount,
        COALESCE(SUM(sales_order_qty), 0) as soQty,
        COALESCE(SUM(so_total_cbm), 0) as soTotalCbm,
        COUNT(CASE WHEN delivery_note_item IS NOT NULL THEN 1 END) as dnCount,
        COALESCE(SUM(delivery_note_qty), 0) as dnQty,
        COALESCE(SUM(dn_total_cbm), 0) as dnTotalCbm,
        COALESCE(SUM(sales_order_qty) - SUM(delivery_note_qty), 0) as soMinusDnQty
      FROM outbound_rows 
      ${whereClause}
      GROUP BY normalized_category
      ORDER BY soQty DESC
    `;

    const categoryResult = await this.pool.query(categoryQuery, params);
    const categoryRows = categoryResult.rows;

    // Get available months
    const monthsQuery = `
      SELECT DISTINCT 
        TO_CHAR(delivery_note_date, 'YYYY-MM') as month,
        TO_CHAR(delivery_note_date, 'Mon YYYY') as label
      FROM outbound_rows 
      WHERE delivery_note_date IS NOT NULL
      ORDER BY month DESC
    `;

    const monthsResult = await this.pool.query(monthsQuery);
    const availableMonths = ['ALL', ...monthsResult.rows.map(r => r.month)];

    // Build category table
    const categoryTable: CategoryRow[] = categoryRows.map(row => ({
      categoryLabel: this.getCategoryLabel(row.normalizedcategory),
      soCount: parseInt(row.socount),
      soQty: parseFloat(row.soqty),
      soTotalCbm: parseFloat(row.sototalcbm),
      dnCount: parseInt(row.dncount),
      dnQty: parseFloat(row.dnqty),
      dnTotalCbm: parseFloat(row.dntotalcbm),
      soMinusDnQty: parseFloat(row.sominusdnqty),
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

    return {
      cards: {
        soSku: parseInt(cards.sosku),
        soQty: parseFloat(cards.soqty),
        soTotalCbm: parseFloat(cards.sototalcbm),
        dnSku: parseInt(cards.dnsku),
        dnQty: parseFloat(cards.dnqty),
        dnTotalCbm: parseFloat(cards.dntotalcbm),
        soMinusDnQty: parseFloat(cards.sominusdnqty),
      },
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
}
