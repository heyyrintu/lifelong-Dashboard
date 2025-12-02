import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  BillingService,
  RecalculateBillingDto,
  BillingLineItemDto,
} from './billing.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('billing')
@Public() // TODO: Remove when frontend auth is ready
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /billing/recalculate
   * Create or recalculate a billing period
   */
  @Post('recalculate')
  async recalculate(@Body() dto: RecalculateBillingDto) {
    return this.billingService.recalculate(dto);
  }

  /**
   * PUT /billing/:billingPeriodId/lines
   * Update extra line items for a billing period
   */
  @Put(':billingPeriodId/lines')
  async updateLineItems(
    @Param('billingPeriodId') billingPeriodId: string,
    @Body() lineItems: BillingLineItemDto[],
  ) {
    return this.billingService.updateLineItems(billingPeriodId, lineItems);
  }

  /**
   * GET /billing/view
   * Get billing view for rendering page
   */
  @Get('view')
  async getBillingView(
    @Query('customerName') customerName: string,
    @Query('location') location: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.billingService.getBillingView({
      customerName,
      location,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
    });
  }

  /**
   * GET /billing/list
   * List all billing periods
   */
  @Get('list')
  async listBillingPeriods() {
    return this.billingService.listBillingPeriods();
  }

  /**
   * GET /billing/:billingPeriodId
   * Get a specific billing period by ID
   */
  @Get(':billingPeriodId')
  async getBillingPeriod(@Param('billingPeriodId') billingPeriodId: string) {
    return this.billingService.getBillingPeriodById(billingPeriodId);
  }

  /**
   * DELETE /billing/:billingPeriodId
   * Delete a billing period
   */
  @Delete(':billingPeriodId')
  async deleteBillingPeriod(@Param('billingPeriodId') billingPeriodId: string) {
    return this.billingService.deleteBillingPeriod(billingPeriodId);
  }

  /**
   * GET /billing/:billingPeriodId/pdf
   * Export billing period as PDF
   */
  @Get(':billingPeriodId/pdf')
  async exportPdf(
    @Param('billingPeriodId') billingPeriodId: string,
    @Res() res: Response,
  ) {
    try {
      const billingPeriod = await this.billingService.getBillingPeriodById(billingPeriodId);
      const html = await this.billingService.generatePdfHtml(billingPeriodId);

      // For now, we'll return HTML that can be printed as PDF from browser
      // In production, you could use puppeteer or pdfkit for server-side PDF generation
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];

      const filename = `Invoice_${billingPeriod.customerName.replace(/\s+/g, '_')}_${billingPeriod.location.replace(/[^a-zA-Z0-9]/g, '-')}_${billingPeriod.year}-${String(billingPeriod.month).padStart(2, '0')}.html`;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(html);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error.message || 'Failed to generate PDF',
      });
    }
  }

  /**
   * GET /billing/:billingPeriodId/excel
   * Export billing period as Excel file with multiple sheets
   * Sheets: Calculation, Inventory HR11, Inventory HR12, Outbound HR11, Outbound HR12
   */
  @Get(':billingPeriodId/excel')
  async exportExcel(
    @Param('billingPeriodId') billingPeriodId: string,
    @Res() res: Response,
  ) {
    try {
      const billingPeriod = await this.billingService.getBillingPeriodById(billingPeriodId);
      const buffer = await this.billingService.generateExcel(billingPeriodId);

      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      const monthShort = monthNames[billingPeriod.month - 1];

      const filename = `Billing_Details_${billingPeriod.customerName.replace(/\s+/g, '_')}_${monthShort}-${billingPeriod.year}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error.message || 'Failed to generate Excel',
      });
    }
  }
}

