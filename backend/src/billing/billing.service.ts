import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../outbound/outbound.service';

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
}

