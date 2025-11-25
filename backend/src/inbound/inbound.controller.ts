import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InboundServiceMock } from './inbound.service.mock';

@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundServiceMock) {}

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
      throw new HttpException(
        error.message || 'Failed to process Item Master file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      throw new HttpException(
        error.message || 'Failed to process Inbound file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      throw new HttpException(
        error.message || 'Failed to fetch uploads',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
  ) {
    try {
      return await this.inboundService.getSummary(uploadId, fromDate, toDate);
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch inbound summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
