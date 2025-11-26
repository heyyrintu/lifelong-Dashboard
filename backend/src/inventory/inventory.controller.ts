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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * POST /inventory/upload
   * Upload and process Inventory (Daily Stock Analytics) Excel file
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInventory(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      console.error('Inventory upload: No file received');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    console.log('Inventory upload received:', {
      originalname: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    });

    try {
      const result = await this.inventoryService.uploadInventory(file.path, file.originalname);
      return result;
    } catch (error) {
      console.error('Inventory upload error:', error);
      throw new HttpException(
        error.message || 'Failed to process Inventory file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /inventory/summary
   * Get inventory summary data with optional filters
   * 
   * Query params:
   * - uploadId: specific upload to use (optional, defaults to latest)
   * - fromDate: start date filter (YYYY-MM-DD)
   * - toDate: end date filter (YYYY-MM-DD)
   * - itemGroup: item group/category filter (optional, "ALL" or specific group)
   */
  @Get('summary')
  async getSummary(
    @Query('uploadId') uploadId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('itemGroup') itemGroup?: string,
  ) {
    try {
      return await this.inventoryService.getSummary(uploadId, fromDate, toDate, itemGroup);
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch inventory summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /inventory/uploads
   * Get list of all inventory uploads
   */
  @Get('uploads')
  async getUploads() {
    try {
      const uploads = await this.inventoryService.getUploads();
      return uploads;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch inventory uploads',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /inventory/uploads/:uploadId
   * Delete an inventory upload and all associated data
   */
  @Delete('uploads/:uploadId')
  async deleteUpload(@Param('uploadId') uploadId: string) {
    try {
      await this.inventoryService.deleteUpload(uploadId);
      return { message: 'Inventory upload deleted successfully' };
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to delete inventory upload',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
