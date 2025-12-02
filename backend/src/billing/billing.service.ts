import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../outbound/outbound.service';
import * as XLSX from 'xlsx-js-style';

export interface RecalculateBillingDto {
  customerName: string;
  location: string;
  year: number;
  month: number;
  fromDate?: string;
  toDate?: string;
  inventoryRate?: number;
  outboundRate?: number;
}

export interface BillingLineItemDto {
  id?: string;
  type: string;
  label: string;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
}

export interface BillingViewParams {
  customerName: string;
  location: string;
  year: number;
  month: number;
}

// Constants for billing rates
const DEFAULT_INVENTORY_RATE = 410;
const DEFAULT_OUTBOUND_RATE = 86;
const DEFAULT_GST_PERCENT = 18;

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private outboundService: OutboundService,
  ) {}

  /**
   * Get Inventory CBM for a given date range
   * Uses the InventoryService internally (no HTTP call)
   */
  async getInventoryCbm(fromDate: string, toDate: string): Promise<number> {
    try {
      const summary = await this.inventoryService.getSummary(
        undefined, // uploadId - use latest
        fromDate,
        toDate,
        undefined, // itemGroup
        undefined, // productCategories
      );
      return summary.cards.totalCbm || 0;
    } catch (error) {
      console.error('Error fetching inventory CBM:', error);
      return 0;
    }
  }

  /**
   * Get Outbound DN Total CBM for a given date range
   * Uses the OutboundService internally (no HTTP call)
   */
  async getOutboundCbm(fromDate: string, toDate: string): Promise<number> {
    try {
      const summary = await this.outboundService.getSummary(
        undefined, // uploadId - use latest
        fromDate,
        toDate,
        undefined, // month
        undefined, // productCategories
        'month', // timeGranularity
      );
      return summary.cards.dnTotalCbm || 0;
    } catch (error) {
      console.error('Error fetching outbound CBM:', error);
      return 0;
    }
  }

  /**
   * Get month date range (first and last day of month)
   */
  private getMonthDateRange(year: number, month: number): { fromDate: string; toDate: string } {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // Last day of the month

    return {
      fromDate: firstDay.toISOString().split('T')[0],
      toDate: lastDay.toISOString().split('T')[0],
    };
  }

  /**
   * Recalculate billing period
   * Creates or updates a BillingPeriod with fresh CBM data from Inventory and Outbound modules
   */
  async recalculate(dto: RecalculateBillingDto) {
    const { customerName, location, year, month } = dto;

    // Resolve date range
    let fromDate = dto.fromDate;
    let toDate = dto.toDate;

    if (!fromDate || !toDate) {
      const range = this.getMonthDateRange(year, month);
      fromDate = fromDate || range.fromDate;
      toDate = toDate || range.toDate;
    }

    // Get CBM values from existing modules
    const [inventoryCbm, outboundCbm] = await Promise.all([
      this.getInventoryCbm(fromDate, toDate),
      this.getOutboundCbm(fromDate, toDate),
    ]);

    // Use provided rates or defaults
    const inventoryRate = dto.inventoryRate ?? DEFAULT_INVENTORY_RATE;
    const outboundRate = dto.outboundRate ?? DEFAULT_OUTBOUND_RATE;

    // Calculate core amounts
    const inventoryAmount = inventoryCbm * inventoryRate;
    const outboundAmount = outboundCbm * outboundRate;

    // Check if billing period already exists
    const existingPeriod = await this.prisma.billingPeriod.findUnique({
      where: {
        customerName_location_year_month: {
          customerName,
          location,
          year,
          month,
        },
      },
      include: { lineItems: true },
    });

    if (existingPeriod) {
      // Update existing period
      // Update core line items
      await this.prisma.billingLineItem.updateMany({
        where: {
          billingPeriodId: existingPeriod.id,
          type: 'INVENTORY',
          isCore: true,
        },
        data: {
          cbm: inventoryCbm,
          rate: inventoryRate,
          amount: inventoryAmount,
        },
      });

      await this.prisma.billingLineItem.updateMany({
        where: {
          billingPeriodId: existingPeriod.id,
          type: 'OUTBOUND',
          isCore: true,
        },
        data: {
          cbm: outboundCbm,
          rate: outboundRate,
          amount: outboundAmount,
        },
      });

      // Recalculate totals
      const allLineItems = await this.prisma.billingLineItem.findMany({
        where: { billingPeriodId: existingPeriod.id },
      });

      const subtotalAmount = allLineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const gstAmount = subtotalAmount * (existingPeriod.gstPercent / 100);
      const grandTotal = subtotalAmount + gstAmount;

      // Update billing period
      const updatedPeriod = await this.prisma.billingPeriod.update({
        where: { id: existingPeriod.id },
        data: {
          fromDate: new Date(fromDate),
          toDate: new Date(toDate),
          inventoryCbm,
          outboundCbm,
          inventoryRate,
          outboundRate,
          inventoryAmount,
          outboundAmount,
          subtotalAmount,
          gstAmount,
          grandTotal,
        },
        include: { lineItems: true },
      });

      return { billingPeriod: updatedPeriod };
    }

    // Create new billing period with core line items
    const newPeriod = await this.prisma.billingPeriod.create({
      data: {
        customerName,
        location,
        year,
        month,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        inventoryCbm,
        outboundCbm,
        inventoryRate,
        outboundRate,
        inventoryAmount,
        outboundAmount,
        subtotalAmount: inventoryAmount + outboundAmount,
        gstPercent: DEFAULT_GST_PERCENT,
        gstAmount: (inventoryAmount + outboundAmount) * (DEFAULT_GST_PERCENT / 100),
        grandTotal:
          (inventoryAmount + outboundAmount) +
          (inventoryAmount + outboundAmount) * (DEFAULT_GST_PERCENT / 100),
        lineItems: {
          create: [
            {
              type: 'INVENTORY',
              label: 'Inventory',
              qty: null,
              cbm: inventoryCbm,
              rate: inventoryRate,
              amount: inventoryAmount,
              isCore: true,
              source: 'SYSTEM',
            },
            {
              type: 'OUTBOUND',
              label: 'Out Bound',
              qty: null,
              cbm: outboundCbm,
              rate: outboundRate,
              amount: outboundAmount,
              isCore: true,
              source: 'SYSTEM',
            },
          ],
        },
      },
      include: { lineItems: true },
    });

    return { billingPeriod: newPeriod };
  }

  /**
   * Update extra line items (non-core)
   * Handles create, update, and delete operations
   */
  async updateLineItems(billingPeriodId: string, lineItems: BillingLineItemDto[]) {
    // Verify billing period exists
    const billingPeriod = await this.prisma.billingPeriod.findUnique({
      where: { id: billingPeriodId },
      include: { lineItems: true },
    });

    if (!billingPeriod) {
      throw new NotFoundException(`Billing period with ID ${billingPeriodId} not found`);
    }

    // Get existing non-core line items
    const existingNonCoreIds = billingPeriod.lineItems
      .filter((item) => !item.isCore)
      .map((item) => item.id);

    // Track which IDs are in the incoming payload
    const incomingIds = lineItems.filter((item) => item.id).map((item) => item.id);

    // Delete items not in the incoming payload
    const idsToDelete = existingNonCoreIds.filter((id) => !incomingIds.includes(id));
    if (idsToDelete.length > 0) {
      await this.prisma.billingLineItem.deleteMany({
        where: {
          id: { in: idsToDelete },
          isCore: false, // Safety: only delete non-core items
        },
      });
    }

    // Update or create line items
    for (const item of lineItems) {
      const amount = item.amount ?? (item.qty ?? 0) * (item.rate ?? 0);

      if (item.id) {
        // Update existing
        await this.prisma.billingLineItem.update({
          where: { id: item.id },
          data: {
            type: item.type,
            label: item.label,
            qty: item.qty,
            rate: item.rate,
            amount,
          },
        });
      } else {
        // Create new
        await this.prisma.billingLineItem.create({
          data: {
            billingPeriodId,
            type: item.type,
            label: item.label,
            qty: item.qty,
            rate: item.rate,
            amount,
            isCore: false,
            source: 'USER',
          },
        });
      }
    }

    // Recalculate totals
    const allLineItems = await this.prisma.billingLineItem.findMany({
      where: { billingPeriodId },
    });

    const subtotalAmount = allLineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const gstAmount = subtotalAmount * (billingPeriod.gstPercent / 100);
    const grandTotal = subtotalAmount + gstAmount;

    // Update billing period totals
    const updatedPeriod = await this.prisma.billingPeriod.update({
      where: { id: billingPeriodId },
      data: {
        subtotalAmount,
        gstAmount,
        grandTotal,
      },
      include: { lineItems: true },
    });

    return { billingPeriod: updatedPeriod };
  }

  /**
   * Get billing view for rendering page and PDF
   */
  async getBillingView(params: BillingViewParams) {
    const { customerName, location, year, month } = params;

    const billingPeriod = await this.prisma.billingPeriod.findUnique({
      where: {
        customerName_location_year_month: {
          customerName,
          location,
          year,
          month,
        },
      },
      include: {
        lineItems: {
          orderBy: [
            { isCore: 'desc' }, // Core items first
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (!billingPeriod) {
      throw new NotFoundException(
        `No billing period found for ${customerName} at ${location} for ${year}-${month}`,
      );
    }

    return { billingPeriod };
  }

  /**
   * Get billing period by ID
   */
  async getBillingPeriodById(id: string) {
    const billingPeriod = await this.prisma.billingPeriod.findUnique({
      where: { id },
      include: {
        lineItems: {
          orderBy: [
            { isCore: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (!billingPeriod) {
      throw new NotFoundException(`Billing period with ID ${id} not found`);
    }

    return billingPeriod;
  }

  /**
   * Generate PDF invoice HTML content
   */
  async generatePdfHtml(billingPeriodId: string): Promise<string> {
    const billingPeriod = await this.getBillingPeriodById(billingPeriodId);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[billingPeriod.month - 1];

    // Separate core and extra line items
    const coreItems = billingPeriod.lineItems.filter((item) => item.isCore);
    const extraItems = billingPeriod.lineItems.filter((item) => !item.isCore);

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const formatNumber = (num: number | null | undefined) => {
      if (num === null || num === undefined) return '-';
      return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${billingPeriod.customerName} - ${monthName} ${billingPeriod.year}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      color: #333;
      padding: 40px;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e53935;
    }
    .header h1 {
      font-size: 24px;
      color: #e53935;
      margin-bottom: 5px;
    }
    .header p {
      color: #666;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .info-box {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      min-width: 200px;
    }
    .info-box h3 {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .info-box p {
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #e53935;
      color: white;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #eee;
    }
    .section-header {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 13px;
    }
    .section-header td {
      padding: 10px 8px;
      border-bottom: 2px solid #ddd;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .total-row {
      background: #fff3e0;
      font-weight: 600;
    }
    .total-row td {
      border-bottom: 2px solid #ff9800;
    }
    .gst-row {
      background: #e3f2fd;
    }
    .grand-total-row {
      background: #c8e6c9;
      font-weight: 700;
      font-size: 14px;
    }
    .grand-total-row td {
      border-bottom: 3px solid #4caf50;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #999;
      font-size: 10px;
    }
    .amount-col {
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>INVOICE</h1>
    <p>Billing Statement for ${monthName} ${billingPeriod.year}</p>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>Customer</h3>
      <p>${billingPeriod.customerName}</p>
    </div>
    <div class="info-box">
      <h3>Location</h3>
      <p>${billingPeriod.location}</p>
    </div>
    <div class="info-box">
      <h3>Billing Period</h3>
      <p>${billingPeriod.fromDate ? new Date(billingPeriod.fromDate).toLocaleDateString('en-IN') : '-'} to ${billingPeriod.toDate ? new Date(billingPeriod.toDate).toLocaleDateString('en-IN') : '-'}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40%">Particulars</th>
        <th class="text-center" style="width: 15%">Qty</th>
        <th class="text-center" style="width: 15%">CBM</th>
        <th class="text-right" style="width: 15%">Rate</th>
        <th class="text-right" style="width: 15%">Amount</th>
      </tr>
    </thead>
    <tbody>
      <!-- Core Processing & Storage Section -->
      <tr class="section-header">
        <td colspan="5">Qty- Processing & Storage Footwear- B2C</td>
      </tr>
      ${coreItems.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td class="text-center">${item.qty !== null ? formatNumber(item.qty) : '-'}</td>
        <td class="text-center">${formatNumber(item.cbm)}</td>
        <td class="text-right amount-col">${formatCurrency(item.rate || 0)}</td>
        <td class="text-right amount-col">${formatCurrency(item.amount)}</td>
      </tr>
      `).join('')}

      ${extraItems.length > 0 ? `
      <!-- Other Expenses Section -->
      <tr class="section-header">
        <td colspan="5">Other Expenses</td>
      </tr>
      ${extraItems.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td class="text-center">${item.qty !== null ? formatNumber(item.qty) : '-'}</td>
        <td class="text-center">${item.cbm !== null ? formatNumber(item.cbm) : '-'}</td>
        <td class="text-right amount-col">${item.rate !== null ? formatCurrency(item.rate) : '-'}</td>
        <td class="text-right amount-col">${formatCurrency(item.amount)}</td>
      </tr>
      `).join('')}
      ` : ''}

      <!-- Totals -->
      <tr class="total-row">
        <td colspan="4" class="text-right">Total</td>
        <td class="text-right amount-col">${formatCurrency(billingPeriod.subtotalAmount)}</td>
      </tr>
      <tr class="gst-row">
        <td colspan="4" class="text-right">GST @ ${billingPeriod.gstPercent}%</td>
        <td class="text-right amount-col">${formatCurrency(billingPeriod.gstAmount)}</td>
      </tr>
      <tr class="grand-total-row">
        <td colspan="4" class="text-right">Grand Total</td>
        <td class="text-right amount-col">${formatCurrency(billingPeriod.grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
    <p>This is a computer-generated invoice.</p>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * List all billing periods
   */
  async listBillingPeriods() {
    return this.prisma.billingPeriod.findMany({
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
      include: {
        _count: {
          select: { lineItems: true },
        },
      },
    });
  }

  /**
   * Delete a billing period
   */
  async deleteBillingPeriod(id: string) {
    const billingPeriod = await this.prisma.billingPeriod.findUnique({
      where: { id },
    });

    if (!billingPeriod) {
      throw new NotFoundException(`Billing period with ID ${id} not found`);
    }

    await this.prisma.billingPeriod.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Generate Excel file for billing invoice
   * Creates 5 sheets: Calculation, Inventory HR11, Inventory HR12, Outbound HR11, Outbound HR12
   */
  async generateExcel(billingPeriodId: string): Promise<Buffer> {
    const billingPeriod = await this.getBillingPeriodById(billingPeriodId);
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[billingPeriod.month - 1];
    const monthShort = monthName.substring(0, 3);

    // Get date range
    const fromDate = billingPeriod.fromDate 
      ? billingPeriod.fromDate.toISOString().split('T')[0] 
      : this.getMonthDateRange(billingPeriod.year, billingPeriod.month).fromDate;
    const toDate = billingPeriod.toDate 
      ? billingPeriod.toDate.toISOString().split('T')[0] 
      : this.getMonthDateRange(billingPeriod.year, billingPeriod.month).toDate;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Calculation (Billing Summary)
    const calcSheet = this.createCalculationSheet(billingPeriod, monthShort, billingPeriod.year);
    XLSX.utils.book_append_sheet(workbook, calcSheet, 'Calculation');

    // Fetch inventory and outbound data for HR11 and HR12
    const [inventoryHR11, inventoryHR12, outboundHR11, outboundHR12] = await Promise.all([
      this.getInventoryDataForWarehouse('HR11', fromDate, toDate),
      this.getInventoryDataForWarehouse('HR12', fromDate, toDate),
      this.getOutboundDataForWarehouse('HR11', fromDate, toDate),
      this.getOutboundDataForWarehouse('HR12', fromDate, toDate),
    ]);

    // Sheet 2: Inventory HR11
    const invHR11Sheet = this.createInventorySheet(inventoryHR11, 'HR11', monthShort, billingPeriod.year);
    XLSX.utils.book_append_sheet(workbook, invHR11Sheet, 'Inventory HR11');

    // Sheet 3: Inventory HR12
    const invHR12Sheet = this.createInventorySheet(inventoryHR12, 'HR12', monthShort, billingPeriod.year);
    XLSX.utils.book_append_sheet(workbook, invHR12Sheet, 'Inventory HR12');

    // Sheet 4: Outbound HR11
    const outHR11Sheet = this.createOutboundSheet(outboundHR11, 'HR11', monthShort, billingPeriod.year);
    XLSX.utils.book_append_sheet(workbook, outHR11Sheet, 'Outbound HR11');

    // Sheet 5: Outbound HR12
    const outHR12Sheet = this.createOutboundSheet(outboundHR12, 'HR12', monthShort, billingPeriod.year);
    XLSX.utils.book_append_sheet(workbook, outHR12Sheet, 'Outbound HR12');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * Style definitions for Excel
   */
  private getStyles() {
    return {
      // Title style - Bold, large font, dark blue background
      title: {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4E79' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      // Company header - Bold, medium font
      companyHeader: {
        font: { bold: true, sz: 14, color: { rgb: '1F4E79' } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
      // Section header - Bold, colored background
      sectionHeader: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: 'E53935' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: this.getBorder(),
      },
      // Column header - Bold, gray background
      columnHeader: {
        font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4472C4' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: this.getBorder(),
      },
      // Data cell - Normal with border
      dataCell: {
        font: { sz: 10 },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: this.getBorder(),
      },
      // Number cell - Right aligned with border
      numberCell: {
        font: { sz: 10 },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: this.getBorder(),
        numFmt: '#,##0.00',
      },
      // Total row - Bold, yellow background
      totalRow: {
        font: { bold: true, sz: 11, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FFF2CC' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: this.getBorder(),
      },
      // GST row - Bold, light blue background
      gstRow: {
        font: { bold: true, sz: 10, color: { rgb: '1F4E79' } },
        fill: { fgColor: { rgb: 'DEEBF7' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: this.getBorder(),
      },
      // Grand total - Bold, green background
      grandTotal: {
        font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2E7D32' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: this.getBorder(),
      },
      // Other expenses header - Orange background
      otherExpensesHeader: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: 'ED6C02' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: this.getBorder(),
      },
    };
  }

  private getBorder() {
    return {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } },
    };
  }

  /**
   * Apply style to a cell
   */
  private setCellStyle(ws: XLSX.WorkSheet, cellRef: string, style: any, value?: any) {
    if (!ws[cellRef]) {
      ws[cellRef] = { v: value ?? '', t: 's' };
    }
    ws[cellRef].s = style;
  }

  /**
   * Create Calculation (Billing Summary) sheet
   */
  private createCalculationSheet(billingPeriod: any, monthShort: string, year: number): XLSX.WorkSheet {
    const coreItems = billingPeriod.lineItems.filter((item: any) => item.isCore);
    const extraItems = billingPeriod.lineItems.filter((item: any) => !item.isCore);
    const styles = this.getStyles();

    // Build data rows
    const data: any[][] = [];

    // Row 0: Company name
    data.push(['Drona Logitech Pvt. Ltd.', '', '', '', 'Month', `${monthShort}-${year.toString().slice(-2)}`]);
    // Row 1: Customer
    data.push(['Customer Name :-', billingPeriod.customerName, '', '', '', '']);
    // Row 2: Location
    data.push(['Location:-', billingPeriod.location, '', '', '', '']);
    // Row 3: Empty
    data.push(['', '', '', '', '', '']);
    // Row 4: Column headers
    data.push(['Particulars.', 'Qty', 'CBM', 'Rate', 'Total Amount', 'Remarks']);
    // Row 5: Empty
    data.push(['', '', '', '', '', '']);
    // Row 6: Core section header
    data.push(['Qty- Processing & Storage Footwear- B2C', '', '', '', '', '']);

    let rowIndex = 7;
    // Core items (Inventory, Out Bound)
    for (const item of coreItems) {
      data.push([
        item.label,
        item.qty !== null ? item.qty : '',
        item.cbm !== null ? Math.round(item.cbm * 100) / 100 : '',
        item.rate || '',
        Math.round(item.amount * 100) / 100,
        ''
      ]);
      rowIndex++;
    }

    // Packaging Material row
    data.push(['Packaging Material', '', 175, 410, 71750, '']);
    rowIndex++;
    
    // Empty row
    data.push(['', '', '', '', '', '']);
    rowIndex++;

    // Other Expenses section header
    const otherExpensesRow = rowIndex;
    data.push(['Other Expenses.', 'Qty', '', 'Rate', 'Amount', '']);
    rowIndex++;

    for (const item of extraItems) {
      data.push([
        item.label,
        item.qty !== null ? item.qty : '',
        '',
        item.rate || '',
        Math.round(item.amount * 100) / 100,
        ''
      ]);
      rowIndex++;
    }

    // Empty row
    data.push(['', '', '', '', '', '']);
    rowIndex++;

    // Totals
    const totalRow = rowIndex;
    data.push(['Total', '', '', '', Math.round(billingPeriod.subtotalAmount * 100) / 100, '']);
    rowIndex++;
    
    const gstRow = rowIndex;
    data.push([`GST. @ ${billingPeriod.gstPercent}%`, '', '', '', Math.round(billingPeriod.gstAmount * 100) / 100, '']);
    rowIndex++;
    
    const grandTotalRow = rowIndex;
    data.push(['Grand Total', '', '', '', Math.round(billingPeriod.grandTotal * 100) / 100, '']);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Apply styles
    // Row 0: Company header
    this.setCellStyle(ws, 'A1', styles.companyHeader);
    this.setCellStyle(ws, 'E1', { font: { bold: true, sz: 10 }, alignment: { horizontal: 'right' } });
    this.setCellStyle(ws, 'F1', { font: { bold: true, sz: 11, color: { rgb: 'E53935' } } });

    // Row 1-2: Customer/Location
    this.setCellStyle(ws, 'A2', { font: { bold: true, sz: 10 } });
    this.setCellStyle(ws, 'B2', { font: { sz: 10 } });
    this.setCellStyle(ws, 'A3', { font: { bold: true, sz: 10 } });
    this.setCellStyle(ws, 'B3', { font: { sz: 10 } });

    // Row 4: Column headers
    ['A5', 'B5', 'C5', 'D5', 'E5', 'F5'].forEach(cell => {
      this.setCellStyle(ws, cell, styles.columnHeader);
    });

    // Row 6: Core section header
    ['A7', 'B7', 'C7', 'D7', 'E7', 'F7'].forEach(cell => {
      this.setCellStyle(ws, cell, styles.sectionHeader);
    });

    // Data rows styling
    for (let i = 8; i <= 8 + coreItems.length; i++) {
      this.setCellStyle(ws, `A${i}`, styles.dataCell);
      this.setCellStyle(ws, `B${i}`, styles.numberCell);
      this.setCellStyle(ws, `C${i}`, styles.numberCell);
      this.setCellStyle(ws, `D${i}`, styles.numberCell);
      this.setCellStyle(ws, `E${i}`, styles.numberCell);
      this.setCellStyle(ws, `F${i}`, styles.dataCell);
    }

    // Other Expenses header
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      this.setCellStyle(ws, `${col}${otherExpensesRow + 1}`, styles.otherExpensesHeader);
    });

    // Total row styling
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      this.setCellStyle(ws, `${col}${totalRow + 1}`, styles.totalRow);
    });

    // GST row styling
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      this.setCellStyle(ws, `${col}${gstRow + 1}`, styles.gstRow);
    });

    // Grand Total row styling
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      this.setCellStyle(ws, `${col}${grandTotalRow + 1}`, styles.grandTotal);
    });

    // Set column widths
    ws['!cols'] = [
      { wch: 42 }, // Particulars
      { wch: 15 }, // Qty
      { wch: 15 }, // CBM
      { wch: 12 }, // Rate
      { wch: 18 }, // Amount
      { wch: 15 }, // Remarks
    ];

    // Set row heights
    ws['!rows'] = [
      { hpt: 25 }, // Company header
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 10 },
      { hpt: 22 }, // Column headers
    ];

    return ws;
  }

  /**
   * Get inventory data for a specific warehouse
   */
  private async getInventoryDataForWarehouse(warehouseCode: string, fromDate: string, toDate: string) {
    // Find warehouse that contains the code (HR11 or HR12)
    const rows = await this.prisma.inventoryRow.findMany({
      where: {
        warehouse: { contains: warehouseCode },
        isTotalRow: false,
      },
      include: {
        dailyStocks: {
          where: {
            stockDate: {
              gte: new Date(fromDate),
              lte: new Date(toDate),
            },
          },
          orderBy: { stockDate: 'asc' },
        },
      },
    });

    // Process rows and calculate avg qty and avg cbm
    return rows.map(row => {
      const quantities = row.dailyStocks.map(ds => ds.quantity);
      const avgQty = quantities.length > 0 
        ? quantities.reduce((a, b) => a + b, 0) / quantities.length 
        : 0;
      const avgCbm = avgQty * row.cbmPerUnit;

      return {
        item: row.item,
        warehouse: row.warehouse,
        itemGroup: row.itemGroup,
        cbmPerUnit: row.cbmPerUnit,
        productCategory: row.productCategory,
        avgQty: Math.round(avgQty * 100) / 100,
        avgCbm: Math.round(avgCbm * 100) / 100,
        dailyStocks: row.dailyStocks,
      };
    });
  }

  /**
   * Get outbound data for a specific warehouse
   */
  private async getOutboundDataForWarehouse(warehouseCode: string, fromDate: string, toDate: string) {
    const rows = await this.prisma.outboundRow.findMany({
      where: {
        sourceWarehouse: { contains: warehouseCode },
        deliveryNoteDate: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      },
      orderBy: { deliveryNoteDate: 'asc' },
    });

    return rows;
  }

  /**
   * Create Inventory sheet with avg qty and avg cbm columns
   */
  private createInventorySheet(data: any[], warehouseCode: string, monthShort: string, year: number): XLSX.WorkSheet {
    const styles = this.getStyles();
    
    // Header rows
    const sheetData: any[][] = [];
    
    // Row 0: Title
    sheetData.push([`Daily Stock Analytics - ${warehouseCode}`, '', '', '', '', '', '']);
    // Row 1: Period
    sheetData.push([`Period: ${monthShort}-${year}`, '', '', '', '', '', '']);
    // Row 2: Empty
    sheetData.push(['', '', '', '', '', '', '']);

    // Row 3: Column headers
    sheetData.push([
      'Item',
      'Warehouse', 
      'Item Group',
      'Product Category',
      'CBM Per Unit',
      'Avg Qty',
      'Avg CBM'
    ]);

    // Calculate totals
    let totalAvgQty = 0;
    let totalAvgCbm = 0;

    // Data rows starting from row 4
    for (const row of data) {
      sheetData.push([
        row.item,
        row.warehouse,
        row.itemGroup,
        row.productCategory || '',
        row.cbmPerUnit,
        row.avgQty,
        row.avgCbm,
      ]);
      totalAvgQty += row.avgQty;
      totalAvgCbm += row.avgCbm;
    }

    // Empty row
    sheetData.push(['', '', '', '', '', '', '']);
    
    // Total row
    const totalRowIndex = sheetData.length;
    sheetData.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      Math.round(totalAvgQty * 100) / 100,
      Math.round(totalAvgCbm * 100) / 100,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Apply styles
    // Title row (Row 1)
    this.setCellStyle(ws, 'A1', styles.title);
    ['B1', 'C1', 'D1', 'E1', 'F1', 'G1'].forEach(cell => {
      this.setCellStyle(ws, cell, styles.title);
    });

    // Period row (Row 2)
    this.setCellStyle(ws, 'A2', { 
      font: { bold: true, sz: 11, color: { rgb: '666666' } },
      alignment: { horizontal: 'left' }
    });

    // Column headers (Row 4)
    ['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4'].forEach(cell => {
      this.setCellStyle(ws, cell, styles.columnHeader);
    });

    // Data rows with alternating colors
    for (let i = 5; i < 5 + data.length; i++) {
      const isEven = (i - 5) % 2 === 0;
      const rowStyle = isEven ? {
        font: { sz: 9 },
        fill: { fgColor: { rgb: 'F8F9FA' } },
        border: this.getBorder(),
        alignment: { vertical: 'center' },
      } : {
        font: { sz: 9 },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border: this.getBorder(),
        alignment: { vertical: 'center' },
      };
      
      const numberStyle = { ...rowStyle, alignment: { horizontal: 'right', vertical: 'center' } };
      
      this.setCellStyle(ws, `A${i}`, rowStyle);
      this.setCellStyle(ws, `B${i}`, rowStyle);
      this.setCellStyle(ws, `C${i}`, rowStyle);
      this.setCellStyle(ws, `D${i}`, rowStyle);
      this.setCellStyle(ws, `E${i}`, numberStyle);
      this.setCellStyle(ws, `F${i}`, numberStyle);
      this.setCellStyle(ws, `G${i}`, numberStyle);
    }

    // Total row styling
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(col => {
      this.setCellStyle(ws, `${col}${totalRowIndex + 1}`, styles.totalRow);
    });

    // Set column widths
    ws['!cols'] = [
      { wch: 28 }, // Item
      { wch: 18 }, // Warehouse
      { wch: 20 }, // Item Group
      { wch: 16 }, // Product Category
      { wch: 14 }, // CBM Per Unit
      { wch: 12 }, // Avg Qty
      { wch: 12 }, // Avg CBM
    ];

    // Set row heights
    ws['!rows'] = [
      { hpt: 28 }, // Title
      { hpt: 20 }, // Period
      { hpt: 10 }, // Empty
      { hpt: 24 }, // Column headers
    ];

    return ws;
  }

  /**
   * Create Outbound sheet
   */
  private createOutboundSheet(data: any[], warehouseCode: string, monthShort: string, year: number): XLSX.WorkSheet {
    const styles = this.getStyles();
    
    // Header rows
    const sheetData: any[][] = [];
    
    // Row 0: Title
    sheetData.push([`Outward - ${warehouseCode}`, '', '', '', '', '', '', '']);
    // Row 1: Period
    sheetData.push([`Period: ${monthShort}-${year}`, '', '', '', '', '', '', '']);
    // Row 2: Empty
    sheetData.push(['', '', '', '', '', '', '', '']);

    // Row 3: Column headers
    sheetData.push([
      'Delivery Note Date',
      'Source Warehouse',
      'Customer Group',
      'SO Item',
      'Category',
      'DN Item',
      'DN Qty',
      'DN Total CBM'
    ]);

    // Calculate totals
    let totalDnQty = 0;
    let totalDnCbm = 0;

    // Data rows starting from row 4
    for (const row of data) {
      const dnDate = row.deliveryNoteDate 
        ? new Date(row.deliveryNoteDate).toLocaleDateString('en-IN') 
        : '';
      
      sheetData.push([
        dnDate,
        row.sourceWarehouse || '',
        row.customerGroup || '',
        row.soItem || '',
        row.categoryRaw || '',
        row.deliveryNoteItem || '',
        row.deliveryNoteQty,
        Math.round(row.dnTotalCbm * 10000) / 10000,
      ]);
      totalDnQty += row.deliveryNoteQty || 0;
      totalDnCbm += row.dnTotalCbm || 0;
    }

    // Empty row
    sheetData.push(['', '', '', '', '', '', '', '']);
    
    // Total row
    const totalRowIndex = sheetData.length;
    sheetData.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      totalDnQty,
      Math.round(totalDnCbm * 100) / 100,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Apply styles
    // Title row (Row 1) - Green theme for outbound
    const outboundTitleStyle = {
      font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2E7D32' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'].forEach(cell => {
      this.setCellStyle(ws, cell, outboundTitleStyle);
    });

    // Period row (Row 2)
    this.setCellStyle(ws, 'A2', { 
      font: { bold: true, sz: 11, color: { rgb: '666666' } },
      alignment: { horizontal: 'left' }
    });

    // Column headers (Row 4) - Green theme
    const outboundHeaderStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '388E3C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: this.getBorder(),
    };
    ['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4'].forEach(cell => {
      this.setCellStyle(ws, cell, outboundHeaderStyle);
    });

    // Data rows with alternating colors
    for (let i = 5; i < 5 + data.length; i++) {
      const isEven = (i - 5) % 2 === 0;
      const rowStyle = isEven ? {
        font: { sz: 9 },
        fill: { fgColor: { rgb: 'E8F5E9' } },
        border: this.getBorder(),
        alignment: { vertical: 'center' },
      } : {
        font: { sz: 9 },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border: this.getBorder(),
        alignment: { vertical: 'center' },
      };
      
      const numberStyle = { ...rowStyle, alignment: { horizontal: 'right', vertical: 'center' } };
      
      this.setCellStyle(ws, `A${i}`, rowStyle);
      this.setCellStyle(ws, `B${i}`, rowStyle);
      this.setCellStyle(ws, `C${i}`, rowStyle);
      this.setCellStyle(ws, `D${i}`, rowStyle);
      this.setCellStyle(ws, `E${i}`, rowStyle);
      this.setCellStyle(ws, `F${i}`, rowStyle);
      this.setCellStyle(ws, `G${i}`, numberStyle);
      this.setCellStyle(ws, `H${i}`, numberStyle);
    }

    // Total row styling - Green theme
    const outboundTotalStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1B5E20' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: this.getBorder(),
    };
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      this.setCellStyle(ws, `${col}${totalRowIndex + 1}`, outboundTotalStyle);
    });

    // Set column widths
    ws['!cols'] = [
      { wch: 16 }, // Date
      { wch: 18 }, // Source Warehouse
      { wch: 20 }, // Customer Group
      { wch: 14 }, // SO Item
      { wch: 18 }, // Category
      { wch: 14 }, // DN Item
      { wch: 12 }, // DN Qty
      { wch: 14 }, // DN Total CBM
    ];

    // Set row heights
    ws['!rows'] = [
      { hpt: 28 }, // Title
      { hpt: 20 }, // Period
      { hpt: 10 }, // Empty
      { hpt: 24 }, // Column headers
    ];

    return ws;
  }
}

