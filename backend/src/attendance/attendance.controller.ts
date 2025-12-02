import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttendanceService } from './attendance.service';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeType } from './dto/employee.dto';
import { CreateAttendanceDto, UpdateAttendanceDto, AttendanceStatus, BulkAttendanceDto } from './dto/attendance.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('attendance')
@Public() // Make all attendance endpoints public for now
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ============================================
  // Employee Endpoints
  // ============================================

  @Post('employees')
  async createEmployee(@Body() dto: CreateEmployeeDto) {
    return this.attendanceService.createEmployee(dto);
  }

  @Get('employees')
  async getEmployees(
    @Query('employeeType') employeeType?: EmployeeType,
    @Query('isActive') isActive?: string,
    @Query('vendor') vendor?: string,
    @Query('search') search?: string,
  ) {
    return this.attendanceService.getEmployees({
      employeeType,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      vendor,
      search,
    });
  }

  @Get('employees/:id')
  async getEmployeeById(@Param('id') id: string) {
    return this.attendanceService.getEmployeeById(id);
  }

  @Put('employees/:id')
  async updateEmployee(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.attendanceService.updateEmployee(id, dto);
  }

  @Delete('employees/:id')
  async deleteEmployee(@Param('id') id: string) {
    return this.attendanceService.deleteEmployee(id);
  }

  // ============================================
  // Attendance Endpoints
  // ============================================

  @Post('records')
  async createAttendance(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.createAttendance(dto);
  }

  @Post('records/bulk')
  async createBulkAttendance(@Body() dto: BulkAttendanceDto) {
    return this.attendanceService.createBulkAttendance(dto);
  }

  @Get('records')
  async getAttendance(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('employeeId') employeeId?: string,
    @Query('employeeType') employeeType?: EmployeeType,
    @Query('status') status?: AttendanceStatus,
    @Query('vendor') vendor?: string,
  ) {
    return this.attendanceService.getAttendance({
      fromDate,
      toDate,
      employeeId,
      employeeType,
      status,
      vendor,
    });
  }

  @Get('summary')
  async getAttendanceSummary(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('employeeType') employeeType?: EmployeeType,
    @Query('vendor') vendor?: string,
  ) {
    return this.attendanceService.getAttendanceSummary({
      fromDate,
      toDate,
      employeeType,
      vendor,
    });
  }

  @Put('records/:id')
  async updateAttendance(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.updateAttendance(id, dto);
  }

  @Delete('records/:id')
  async deleteAttendance(@Param('id') id: string) {
    return this.attendanceService.deleteAttendance(id);
  }

  // ============================================
  // Excel Upload Endpoint
  // ============================================

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
    }

    return this.attendanceService.processExcelUpload(file.buffer, file.originalname);
  }
}
