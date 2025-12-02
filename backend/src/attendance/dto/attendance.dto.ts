import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LEAVE = 'LEAVE',
  WEEKLY_OFF = 'WEEKLY_OFF',
  HALF_DAY = 'HALF_DAY',
}

export class CreateAttendanceDto {
  @IsString()
  employeeId: string; // UUID of the employee

  @IsDateString()
  date: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  inTime?: string; // HH:mm format or ISO datetime

  @IsOptional()
  @IsString()
  outTime?: string; // HH:mm format or ISO datetime

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsString()
  inTime?: string;

  @IsOptional()
  @IsString()
  outTime?: string;

  @IsOptional()
  @IsNumber()
  totalHours?: number;

  @IsOptional()
  @IsNumber()
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkAttendanceItemDto {
  @IsString()
  employeeId: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  inTime?: string;

  @IsOptional()
  @IsString()
  outTime?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkAttendanceDto {
  @IsDateString()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItemDto)
  attendances: BulkAttendanceItemDto[];
}
