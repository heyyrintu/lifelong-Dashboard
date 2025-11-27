import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Query,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Express, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OutboundService } from './outbound.service';

@Controller('outbound')
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  /**
   * POST /outbound/upload
   * Upload and process an Excel file
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.outboundService.uploadFile(file);
      return result;
    } catch (error) {
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to process file'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /outbound/uploads
   * Get list of all uploaded files
   */
  @Get('uploads')
  async getUploads() {
    try {
      const uploads = await this.outboundService.getUploads();
      return uploads;
    } catch (error) {
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to fetch uploads'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /outbound/uploads/:uploadId
   * Delete uploaded data by upload ID
   */
  @Delete('uploads/:uploadId')
  async deleteUpload(@Param('uploadId') uploadId: string) {
    try {
      await this.outboundService.deleteUpload(uploadId);
      return { message: 'Upload deleted successfully' };
    } catch (error) {
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to delete upload'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /outbound/download-summary
   * Download summary totals as Excel file
   */
  @Get('download-summary')
  async downloadSummary(
    @Res() res: Response,
    @Query('uploadId') uploadId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('month') month?: string,
    @Query('productCategory') productCategory?: string | string[],
  ) {
    try {
      // Normalize productCategory to array
      const categories = productCategory 
        ? (Array.isArray(productCategory) ? productCategory : [productCategory])
        : undefined;
      const excelBuffer = await this.outboundService.generateDetailedExcel(uploadId, fromDate, toDate, month, categories);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=outbound-detailed-data.xlsx');
      res.send(excelBuffer);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to download summary'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /outbound/summary
   * Get summary data with optional filters
   */
  @Get('summary')
  async getSummary(
    @Query('uploadId') uploadId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('month') month?: string,
    @Query('productCategory') productCategory?: string | string[],
    @Query('timeGranularity') timeGranularity?: 'month' | 'week' | 'day',
  ) {
    try {
      // Normalize productCategory to array
      const categories = productCategory 
        ? (Array.isArray(productCategory) ? productCategory : [productCategory])
        : undefined;
      return await this.outboundService.getSummary(
        uploadId, 
        fromDate, 
        toDate, 
        month, 
        categories,
        timeGranularity || 'month',
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to fetch summary'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
}
