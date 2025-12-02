import { IsOptional, IsString, IsDateString, IsIn, IsUUID, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * DTO for outbound summary query parameters
 * Validates and transforms all query inputs
 */
export class OutboundSummaryQueryDto {
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
  month?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Handle both single value and array
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return [value];
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  productCategory?: string[];

  @IsOptional()
  @IsIn(['month', 'week', 'day'], { message: 'timeGranularity must be month, week, or day' })
  timeGranularity?: 'month' | 'week' | 'day' = 'month';
}

/**
 * DTO for download summary query parameters
 */
export class OutboundDownloadQueryDto extends OutboundSummaryQueryDto {}

/**
 * DTO for upload ID parameter
 */
export class UploadIdParamDto {
  @IsUUID('4', { message: 'uploadId must be a valid UUID' })
  uploadId!: string;
}
