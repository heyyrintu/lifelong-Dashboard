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
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OutboundService } from './outbound.service.mock';

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
        error.message || 'Failed to process file',
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
        error.message || 'Failed to fetch uploads',
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
        error.message || 'Failed to delete upload',
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
    @Query('productCategory') productCategory?: string,
  ) {
    try {
      const excelBuffer = await this.outboundService.generateDetailedExcel(uploadId, fromDate, toDate, month, productCategory || 'ALL');
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=outbound-detailed-data.xlsx');
      res.send(excelBuffer);
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to download summary',
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
    @Query('productCategory') productCategory?: string,
    @Query('timeGranularity') timeGranularity?: string,
  ) {
    try {
      return await this.outboundService.getSummary(uploadId, fromDate, toDate, month, productCategory, timeGranularity);
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
