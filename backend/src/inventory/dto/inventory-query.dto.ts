import { IsOptional, IsString, IsDateString, IsUUID, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for inventory summary query parameters
 */
export class InventorySummaryQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'uploadId must be a valid UUID' })
  uploadId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid date string (YYYY-MM-DD)' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid date string (YYYY-MM-DD)' })
  toDate?: string;

  @IsOptional()
  @IsString()
  itemGroup?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return [value];
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  productCategory?: string[];
}

/**
 * DTO for upload ID parameter
 */
export class InventoryUploadIdParamDto {
  @IsUUID('4', { message: 'uploadId must be a valid UUID' })
  uploadId!: string;
}
