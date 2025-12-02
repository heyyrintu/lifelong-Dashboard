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
import type { Express } from 'express';
import { Public } from '../auth/decorators/public.decorator';

@Controller('inventory')
@Public() // TODO: Remove when frontend auth is ready
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
        this.getErrorMessage(error, 'Failed to process Inventory file'),
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
   * - productCategory: product category filter (optional, can be array for multi-select)
   */
  @Get('summary')
  async getSummary(
    @Query('uploadId') uploadId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('itemGroup') itemGroup?: string,
    @Query('productCategory') productCategory?: string | string[],
    @Query('warehouse') warehouse?: string,
  ) {
    try {
      const categories = productCategory
        ? (Array.isArray(productCategory) ? productCategory : [productCategory])
        : undefined;
      return await this.inventoryService.getSummary(uploadId, fromDate, toDate, itemGroup, categories, warehouse);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to fetch inventory summary'),
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
        this.getErrorMessage(error, 'Failed to fetch inventory uploads'),
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
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to delete inventory upload'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /inventory/fast-moving-skus
   * Get fast-moving SKUs with availability analysis
   * 
   * Query params:
   * - warehouse: filter by warehouse (optional, "ALL" or specific warehouse)
   * - productCategory: filter by product category (optional, "ALL" or specific category)
   * - minAvgQty: minimum average quantity threshold (optional, default: 50)
   * - limit: maximum number of results (optional, default: 50)
   */
  @Get('fast-moving-skus')
  async getFastMovingSkus(
    @Query('warehouse') warehouse?: string,
    @Query('productCategory') productCategory?: string,
    @Query('minAvgQty') minAvgQty?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const minQty = minAvgQty ? parseInt(minAvgQty, 10) : undefined;
      const resultLimit = limit ? parseInt(limit, 10) : undefined;
      return await this.inventoryService.getFastMovingSkus(warehouse, productCategory, minQty, resultLimit);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to fetch fast-moving SKUs'),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /inventory/zero-order-products
   * Get products with zero orders (in inventory but not in outbound)
   * 
   * Query params:
   * - warehouse: filter by warehouse (optional, "ALL" or specific warehouse)
   * - productCategory: filter by product category (optional, "ALL" or specific category)
   * - minDaysInStock: minimum days in stock threshold (optional, default: 7)
   * - limit: maximum number of results (optional, default: 50)
   */
  @Get('zero-order-products')
  async getZeroOrderProducts(
    @Query('warehouse') warehouse?: string,
    @Query('productCategory') productCategory?: string,
    @Query('minDaysInStock') minDaysInStock?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const minDays = minDaysInStock ? parseInt(minDaysInStock, 10) : undefined;
      const resultLimit = limit ? parseInt(limit, 10) : undefined;
      return await this.inventoryService.getZeroOrderProducts(warehouse, productCategory, minDays, resultLimit);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw error;
      }
      throw new HttpException(
        this.getErrorMessage(error, 'Failed to fetch zero-order products'),
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
