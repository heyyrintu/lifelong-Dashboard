import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeType } from './dto/employee.dto';
import { CreateAttendanceDto, UpdateAttendanceDto, AttendanceStatus, BulkAttendanceDto } from './dto/attendance.dto';
import * as XLSX from 'xlsx';

const STANDARD_WORKING_HOURS = 9;

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // Employee CRUD
  // ============================================

  async createEmployee(dto: CreateEmployeeDto) {
    // Check if employee ID already exists
    const existing = await this.prisma.employee.findUnique({
      where: { employeeId: dto.employeeId },
    });

    if (existing) {
      throw new BadRequestException(`Employee with ID ${dto.employeeId} already exists`);
    }

    return this.prisma.employee.create({
      data: {
        employeeId: dto.employeeId,
        name: dto.name,
        designation: dto.designation,
        department: dto.department,
        vendor: dto.vendor,
        contact: dto.contact,
        dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : null,
        employeeType: dto.employeeType as any || 'OFF_ROLL',
        location: dto.location || 'Farukh Nagar',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getEmployees(filters?: {
    employeeType?: EmployeeType;
    isActive?: boolean;
    vendor?: string;
    search?: string;
  }) {
    const where: any = {};

    if (filters?.employeeType) {
      where.employeeType = filters.employeeType;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters?.vendor) {
      where.vendor = { contains: filters.vendor, mode: 'insensitive' };
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { employeeId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.employee.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getEmployeeById(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        attendances: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return employee;
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : undefined,
      },
    });
  }

  async deleteEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return this.prisma.employee.delete({ where: { id } });
  }

  // ============================================
  // Attendance CRUD
  // ============================================

  private calculateHours(inTime: Date | null, outTime: Date | null): { totalHours: number; overtimeHours: number } {
    if (!inTime || !outTime) {
      return { totalHours: 0, overtimeHours: 0 };
    }

    const diffMs = outTime.getTime() - inTime.getTime();
    const totalHours = Math.max(0, diffMs / (1000 * 60 * 60));
    const overtimeHours = Math.max(0, totalHours - STANDARD_WORKING_HOURS);

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
    };
  }

  private parseTime(dateStr: string, timeStr: string): Date | null {
    if (!timeStr || timeStr === 'A' || timeStr === 'L' || timeStr === 'W/OFF') {
      return null;
    }

    try {
      // Handle HH:mm format
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date(dateStr);
        date.setHours(hours, minutes, 0, 0);
        return date;
      }

      // Handle ISO datetime
      const parsed = new Date(timeStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  async createAttendance(dto: CreateAttendanceDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${dto.employeeId} not found`);
    }

    const attendanceDate = new Date(dto.date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Check for existing attendance
    const existing = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: dto.employeeId,
          date: attendanceDate,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Attendance already exists for this employee on ${dto.date}`);
    }

    const inTime = dto.inTime ? this.parseTime(dto.date, dto.inTime) : null;
    const outTime = dto.outTime ? this.parseTime(dto.date, dto.outTime) : null;
    const { totalHours, overtimeHours } = this.calculateHours(inTime, outTime);

    return this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        date: attendanceDate,
        status: dto.status as any,
        inTime,
        outTime,
        totalHours,
        overtimeHours,
        remarks: dto.remarks,
        source: 'manual',
      },
      include: {
        employee: true,
      },
    });
  }

  async createBulkAttendance(dto: BulkAttendanceDto) {
    const attendanceDate = new Date(dto.date);
    attendanceDate.setHours(0, 0, 0, 0);

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const att of dto.attendances) {
      try {
        const inTime = att.inTime ? this.parseTime(dto.date, att.inTime) : null;
        const outTime = att.outTime ? this.parseTime(dto.date, att.outTime) : null;
        const { totalHours, overtimeHours } = this.calculateHours(inTime, outTime);

        await this.prisma.attendance.upsert({
          where: {
            employeeId_date: {
              employeeId: att.employeeId,
              date: attendanceDate,
            },
          },
          create: {
            employeeId: att.employeeId,
            date: attendanceDate,
            status: att.status as any,
            inTime,
            outTime,
            totalHours,
            overtimeHours,
            remarks: att.remarks,
            source: 'manual',
          },
          update: {
            status: att.status as any,
            inTime,
            outTime,
            totalHours,
            overtimeHours,
            remarks: att.remarks,
          },
        });

        results.created++;
      } catch (error: any) {
        results.errors.push(`Employee ${att.employeeId}: ${error.message}`);
      }
    }

    return results;
  }

  async updateAttendance(id: string, dto: UpdateAttendanceDto) {
    const attendance = await this.prisma.attendance.findUnique({ where: { id } });
    if (!attendance) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }

    let inTime = attendance.inTime;
    let outTime = attendance.outTime;

    if (dto.inTime !== undefined) {
      inTime = dto.inTime ? this.parseTime(attendance.date.toISOString().split('T')[0], dto.inTime) : null;
    }
    if (dto.outTime !== undefined) {
      outTime = dto.outTime ? this.parseTime(attendance.date.toISOString().split('T')[0], dto.outTime) : null;
    }

    const { totalHours, overtimeHours } = this.calculateHours(inTime, outTime);

    return this.prisma.attendance.update({
      where: { id },
      data: {
        status: dto.status as any,
        inTime,
        outTime,
        totalHours: dto.totalHours ?? totalHours,
        overtimeHours: dto.overtimeHours ?? overtimeHours,
        remarks: dto.remarks,
      },
      include: {
        employee: true,
      },
    });
  }

  async getAttendance(filters: {
    fromDate?: string;
    toDate?: string;
    employeeId?: string;
    employeeType?: EmployeeType;
    status?: AttendanceStatus;
    vendor?: string;
  }) {
    const where: any = {};

    if (filters.fromDate || filters.toDate) {
      where.date = {};
      if (filters.fromDate) {
        where.date.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.date.lte = new Date(filters.toDate);
      }
    }

    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.employeeType || filters.vendor) {
      where.employee = {};
      if (filters.employeeType) {
        where.employee.employeeType = filters.employeeType;
      }
      if (filters.vendor) {
        where.employee.vendor = { contains: filters.vendor, mode: 'insensitive' };
      }
    }

    return this.prisma.attendance.findMany({
      where,
      include: {
        employee: true,
      },
      orderBy: [{ date: 'desc' }, { employee: { name: 'asc' } }],
    });
  }

  async getAttendanceSummary(filters: {
    fromDate?: string;
    toDate?: string;
    employeeType?: EmployeeType;
    vendor?: string;
  }) {
    const where: any = {};

    if (filters.fromDate || filters.toDate) {
      where.date = {};
      if (filters.fromDate) {
        where.date.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.date.lte = new Date(filters.toDate);
      }
    }

    if (filters.employeeType || filters.vendor) {
      where.employee = {};
      if (filters.employeeType) {
        where.employee.employeeType = filters.employeeType;
      }
      if (filters.vendor) {
        where.employee.vendor = { contains: filters.vendor, mode: 'insensitive' };
      }
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: { employee: true },
    });

    // Calculate summary
    const totalRecords = attendances.length;
    const presentCount = attendances.filter(a => a.status === 'PRESENT').length;
    const absentCount = attendances.filter(a => a.status === 'ABSENT').length;
    const leaveCount = attendances.filter(a => a.status === 'LEAVE').length;
    const weeklyOffCount = attendances.filter(a => a.status === 'WEEKLY_OFF').length;
    const halfDayCount = attendances.filter(a => a.status === 'HALF_DAY').length;

    const totalWorkingHours = attendances.reduce((sum, a) => sum + (a.totalHours || 0), 0);
    const totalOvertimeHours = attendances.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);

    // Group by employee
    const employeeStats = new Map<string, {
      employee: any;
      presentDays: number;
      absentDays: number;
      leaveDays: number;
      totalHours: number;
      overtimeHours: number;
    }>();

    for (const att of attendances) {
      const stats = employeeStats.get(att.employeeId) || {
        employee: att.employee,
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        totalHours: 0,
        overtimeHours: 0,
      };

      if (att.status === 'PRESENT') stats.presentDays++;
      if (att.status === 'ABSENT') stats.absentDays++;
      if (att.status === 'LEAVE') stats.leaveDays++;
      stats.totalHours += att.totalHours || 0;
      stats.overtimeHours += att.overtimeHours || 0;

      employeeStats.set(att.employeeId, stats);
    }

    return {
      summary: {
        totalRecords,
        presentCount,
        absentCount,
        leaveCount,
        weeklyOffCount,
        halfDayCount,
        totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      },
      employeeStats: Array.from(employeeStats.values()).map(s => ({
        ...s,
        totalHours: Math.round(s.totalHours * 100) / 100,
        overtimeHours: Math.round(s.overtimeHours * 100) / 100,
      })),
    };
  }

  // ============================================
  // Excel Upload Processing
  // ============================================

  async processExcelUpload(buffer: Buffer, fileName: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const uploadBatch = `upload-${Date.now()}`;

    const results = {
      employeesCreated: 0,
      employeesUpdated: 0,
      attendanceCreated: 0,
      attendanceUpdated: 0,
      errors: [] as string[],
    };

    const sheetNames = workbook.SheetNames;
    
    for (const sheetName of sheetNames) {
      // Skip summary sheets
      if (sheetName.toLowerCase().includes('sheet2') || sheetName.toLowerCase().includes('pending')) {
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];

      if (data.length < 5) continue;

      try {
        const isOnRoll = sheetName.toLowerCase().includes('on roll') || 
                         sheetName.toLowerCase().includes('onroll') ||
                         fileName.toLowerCase().includes('on roll');
        
        await this.processLifelongAttendanceSheet(data, sheetName, uploadBatch, isOnRoll, results);
      } catch (error: any) {
        results.errors.push(`Sheet ${sheetName}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Process Lifelong attendance format where each employee has 4 rows:
   * - Status row (P, A, L, W/OFF, etc.)
   * - In Time row
   * - Out Time row  
   * - Total Hrs row
   * Dates are in columns after employee info
   */
  private async processLifelongAttendanceSheet(
    data: any[][],
    sheetName: string,
    uploadBatch: string,
    isOnRoll: boolean,
    results: any
  ) {
    // Find header rows and date columns
    let dateStartCol = -1;
    let dateRow = -1;
    const dateColumns: { index: number; date: Date }[] = [];

    // Scan first few rows to find dates
    for (let i = 0; i < Math.min(5, data.length); i++) {
      for (let j = 0; j < data[i].length; j++) {
        const cell = data[i][j];
        const date = this.parseExcelDate(cell);
        if (date && date.getFullYear() >= 2020) {
          if (dateStartCol === -1) {
            dateStartCol = j;
            dateRow = i;
          }
          dateColumns.push({ index: j, date });
        }
      }
      if (dateColumns.length > 0) break;
    }

    if (dateColumns.length === 0) {
      throw new Error('No date columns found');
    }

    // Find column mapping from header row (usually row before dates or row 0/1)
    const colMap = this.findColumnMapping(data, dateStartCol);
    
    // Process data in groups of 4 rows (Status, In Time, Out Time, Total Hrs)
    let i = dateRow + 1;
    while (i < data.length) {
      const statusRow = data[i];
      const inTimeRow = data[i + 1];
      const outTimeRow = data[i + 2];
      const totalHrsRow = data[i + 3];

      // Check if this is a valid employee group
      const employeeId = String(statusRow?.[colMap.employeeId] || '').trim();
      const name = String(statusRow?.[colMap.name] || '').trim();
      const rowType = String(statusRow?.[colMap.rowType] || '').toLowerCase();

      // Skip if not a Status row or no employee ID
      if (!employeeId || !name || (rowType && rowType !== 'status')) {
        i++;
        continue;
      }

      // Validate this is a 4-row group by checking row types
      const inTimeRowType = String(inTimeRow?.[colMap.rowType] || '').toLowerCase();
      const outTimeRowType = String(outTimeRow?.[colMap.rowType] || '').toLowerCase();
      
      if (!inTimeRowType.includes('in') && !outTimeRowType.includes('out')) {
        // Not a proper 4-row group, skip
        i++;
        continue;
      }

      try {
        // Create or update employee
        let employee = await this.prisma.employee.findUnique({
          where: { employeeId },
        });

        if (!employee) {
          employee = await this.prisma.employee.create({
            data: {
              employeeId,
              name,
              designation: colMap.designation >= 0 ? String(statusRow[colMap.designation] || '') : null,
              department: colMap.department >= 0 ? String(statusRow[colMap.department] || '') : null,
              vendor: colMap.vendor >= 0 ? String(statusRow[colMap.vendor] || '') : null,
              contact: colMap.contact >= 0 ? String(statusRow[colMap.contact] || '') : null,
              dateOfJoining: colMap.doj >= 0 ? this.parseExcelDate(statusRow[colMap.doj]) : null,
              employeeType: isOnRoll ? 'ON_ROLL' : 'OFF_ROLL',
              location: colMap.location >= 0 ? String(statusRow[colMap.location] || 'Farukh Nagar') : 'Farukh Nagar',
            },
          });
          results.employeesCreated++;
        } else {
          results.employeesUpdated++;
        }

        // Process attendance for each date column
        for (const dateCol of dateColumns) {
          const statusValue = statusRow?.[dateCol.index];
          const inTimeValue = inTimeRow?.[dateCol.index];
          const outTimeValue = outTimeRow?.[dateCol.index];

          // Skip if no status
          if (!statusValue || String(statusValue).trim() === '') continue;

          const status = this.parseAttendanceStatus(String(statusValue));
          const attendanceDate = new Date(dateCol.date);
          attendanceDate.setHours(0, 0, 0, 0);

          // Parse times
          const inTime = this.parseTimeFromCell(inTimeValue, attendanceDate);
          const outTime = this.parseTimeFromCell(outTimeValue, attendanceDate);
          
          // Calculate hours
          const { totalHours, overtimeHours } = this.calculateHours(inTime, outTime);

          try {
            await this.prisma.attendance.upsert({
              where: {
                employeeId_date: {
                  employeeId: employee.id,
                  date: attendanceDate,
                },
              },
              create: {
                employeeId: employee.id,
                date: attendanceDate,
                status: status as any,
                inTime,
                outTime,
                totalHours,
                overtimeHours,
                source: 'excel-upload',
                uploadBatch,
              },
              update: {
                status: status as any,
                inTime,
                outTime,
                totalHours,
                overtimeHours,
                source: 'excel-upload',
                uploadBatch,
              },
            });
            results.attendanceCreated++;
          } catch (error: any) {
            // Skip duplicates
          }
        }
      } catch (error: any) {
        results.errors.push(`Employee ${employeeId}: ${error.message}`);
      }

      // Move to next employee group (4 rows)
      i += 4;
    }
  }

  private findColumnMapping(data: any[][], dateStartCol: number): Record<string, number> {
    const map: Record<string, number> = {
      employeeId: 0,
      name: 2,
      designation: 3,
      department: -1,
      vendor: 6,
      contact: -1,
      doj: 5,
      location: -1,
      rowType: 8, // The column that says "Status", "In Time", etc.
    };

    // Search first few rows for headers
    for (let i = 0; i < Math.min(3, data.length); i++) {
      for (let j = 0; j < Math.min(dateStartCol, data[i].length); j++) {
        const cell = String(data[i][j] || '').toLowerCase().trim();
        
        if (cell.includes('bio code') || cell.includes('id no') || cell === 'code') {
          map.employeeId = j;
        } else if (cell.includes('name') && !cell.includes('father')) {
          map.name = j;
        } else if (cell.includes('designation')) {
          map.designation = j;
        } else if (cell.includes('department') || cell === 'dept') {
          map.department = j;
        } else if (cell.includes('vendor')) {
          map.vendor = j;
        } else if (cell.includes('contact') || cell.includes('phone')) {
          map.contact = j;
        } else if (cell.includes('doj') || cell.includes('date of join') || cell.includes('joining')) {
          map.doj = j;
        } else if (cell.includes('location')) {
          map.location = j;
        } else if (cell === 'status' && j > 5) {
          // This is likely the row type indicator column (not the active/inactive status)
          map.rowType = j;
        }
      }
    }

    return map;
  }

  private parseExcelDate(value: any): Date | null {
    if (!value) return null;

    // If it's already a Date object
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value;
    }

    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try parsing as string
    const str = String(value).trim();
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
      return parsed;
    }

    return null;
  }

  private parseAttendanceStatus(value: string): AttendanceStatus {
    const v = value.toUpperCase().trim();
    
    if (v === 'P' || v === 'PRESENT') return AttendanceStatus.PRESENT;
    if (v === 'A' || v === 'ABSENT') return AttendanceStatus.ABSENT;
    if (v === 'L' || v === 'LEAVE') return AttendanceStatus.LEAVE;
    if (v === 'W/OFF' || v === 'WEEKLY OFF' || v === 'WOFF' || v === 'W OFF' || v === 'W/O') return AttendanceStatus.WEEKLY_OFF;
    if (v === 'HD' || v === 'HALF DAY' || v === 'HALF') return AttendanceStatus.HALF_DAY;

    // If it looks like a time (present but time shown in status column)
    if (/^\d{1,2}:\d{2}/.test(v)) return AttendanceStatus.PRESENT;

    return AttendanceStatus.ABSENT;
  }

  private parseTimeFromCell(value: any, dateContext: Date): Date | null {
    if (!value) return null;

    const strValue = String(value).trim();
    
    // Skip non-time values
    if (strValue === 'A' || strValue === 'L' || strValue.includes('OFF') || strValue === '' || strValue === 'nan') {
      return null;
    }

    // If it's already a Date object (Excel time)
    if (value instanceof Date && !isNaN(value.getTime())) {
      // Excel stores times as dates, extract hours and minutes
      const result = new Date(dateContext);
      result.setHours(value.getHours(), value.getMinutes(), 0, 0);
      return result;
    }

    // Parse HH:MM:SS or HH:MM format
    const timeMatch = strValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const result = new Date(dateContext);
      result.setHours(hours, minutes, 0, 0);
      return result;
    }

    return null;
  }

  async deleteAttendance(id: string) {
    const attendance = await this.prisma.attendance.findUnique({ where: { id } });
    if (!attendance) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }

    return this.prisma.attendance.delete({ where: { id } });
  }
}
