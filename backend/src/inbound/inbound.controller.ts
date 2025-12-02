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
import { InboundService } from './inbound.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('inbound')
@Public() // TODO: Remove when frontend auth is ready
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  /**
   * POST /inbound/item-master/upload
   * Upload and process Item Master Excel file
   */
  @Post('item-master/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadItemMaster(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.inboundService.uploadItemMaster(file.path, file.originalname);
      return result;
    } catch (error) {
      const message = this.getErrorMessage(error, 'Failed to process Item Master file');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /inbound/download-summary
   * Download inbound summary totals as Excel file
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
      const categories = productCategory
        ? (Array.isArray(productCategory) ? productCategory : [productCategory])
        : undefined;
      const excelBuffer = await this.inboundService.generateSummaryExcel(
        uploadId,
        fromDate,
        toDate,
        month,
        categories,
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=inbound-summary.xlsx');
      res.send(excelBuffer);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      const message = this.getErrorMessage(error, 'Failed to download inbound summary');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /inbound/upload
   * Upload and process Inbound Excel file
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInbound(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      console.error('Inbound upload: No file received');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    console.log('Inbound upload received:', {
      originalname: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    });

    try {
      const result = await this.inboundService.uploadInbound(file.path, file.originalname);
      return result;
    } catch (error) {
      console.error('Inbound upload error:', error);
      const message = this.getErrorMessage(error, 'Failed to process Inbound file');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /inbound/uploads
   * Get list of all uploaded files (item-master and inbound)
   */
  @Get('uploads')
  async getUploads() {
    try {
      const uploads = await this.inboundService.getUploads();
      return uploads;
    } catch (error) {
      const message = this.getErrorMessage(error, 'Failed to fetch uploads');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /inbound/summary
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
      const categories = productCategory
        ? (Array.isArray(productCategory) ? productCategory : [productCategory])
        : undefined;
      return await this.inboundService.getSummary(uploadId, fromDate, toDate, month, categories, timeGranularity);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      const message = this.getErrorMessage(error, 'Failed to fetch inbound summary');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * DELETE /inbound/uploads/:uploadId
   * Delete an inbound upload and all associated data
   */
  @Delete('uploads/:uploadId')
  async deleteUpload(@Param('uploadId') uploadId: string) {
    try {
      await this.inboundService.deleteUpload(uploadId);
      return { message: 'Inbound upload deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      const message = this.getErrorMessage(error, 'Failed to delete inbound upload');
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
        return maybeMessage;
      }
    }

    return fallback;
  }
}
