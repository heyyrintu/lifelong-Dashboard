import { 
  IsString, 
  IsInt, 
  IsNumber, 
  IsOptional, 
  Min, 
  Max, 
  IsUUID,
  IsArray,
  ValidateNested,
  IsNotEmpty
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for recalculating billing period
 */
export class RecalculateBillingDto {
  @IsString()
  @IsNotEmpty({ message: 'customerName is required' })
  customerName!: string;

  @IsString()
  @IsNotEmpty({ message: 'location is required' })
  location!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inventoryRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outboundRate?: number;
}

/**
 * DTO for billing line items
 */
export class BillingLineItemDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qty?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number | null;
}

/**
 * DTO for updating line items
 */
export class UpdateLineItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillingLineItemDto)
  lineItems!: BillingLineItemDto[];
}

/**
 * DTO for billing view query parameters
 */
export class BillingViewQueryDto {
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  location!: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

/**
 * DTO for billing period ID parameter
 */
export class BillingPeriodIdParamDto {
  @IsUUID('4', { message: 'billingPeriodId must be a valid UUID' })
  billingPeriodId!: string;
}
