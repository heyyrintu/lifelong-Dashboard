'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Calendar,
  Users,
  Clock,
  Search,
  Download,
  Filter,
  CheckCircle,
  XCircle,
  Coffee,
  Sun,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  FileSpreadsheet,
  TrendingUp,
  Timer,
} from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation?: string;
  department?: string;
  vendor?: string;
  employeeType: 'ON_ROLL' | 'OFF_ROLL';
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee: Employee;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'WEEKLY_OFF' | 'HALF_DAY';
  inTime?: string;
  outTime?: string;
  totalHours: number;
  overtimeHours: number;
  remarks?: string;
  source: string;
}

interface AttendanceSummary {
  summary: {
    totalRecords: number;
    presentCount: number;
    absentCount: number;
    leaveCount: number;
    weeklyOffCount: number;
    halfDayCount: number;
    totalWorkingHours: number;
    totalOvertimeHours: number;
  };
  employeeStats: {
    employee: Employee;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    totalHours: number;
    overtimeHours: number;
  }[];
}

const statusColors: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700 border-green-200',
  ABSENT: 'bg-red-100 text-red-700 border-red-200',
  LEAVE: 'bg-amber-100 text-amber-700 border-amber-200',
  WEEKLY_OFF: 'bg-blue-100 text-blue-700 border-blue-200',
  HALF_DAY: 'bg-purple-100 text-purple-700 border-purple-200',
};

const statusLabels: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  WEEKLY_OFF: 'W/Off',
  HALF_DAY: 'Half Day',
};

export default function ViewAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // First day of current month
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<'ALL' | 'ON_ROLL' | 'OFF_ROLL'>('ALL');
  const [vendorFilter, setVendorFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'records' | 'summary'>('records');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [fromDate, toDate, employeeTypeFilter, vendorFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (employeeTypeFilter !== 'ALL') params.append('employeeType', employeeTypeFilter);
      if (vendorFilter) params.append('vendor', vendorFilter);

      const [recordsRes, summaryRes] = await Promise.all([
        fetch(`${BACKEND_URL}/attendance/records?${params.toString()}`),
        fetch(`${BACKEND_URL}/attendance/summary?${params.toString()}`),
      ]);

      if (recordsRes.ok) {
        const recordsData = await recordsRes.json();
        setRecords(recordsData);
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage({ type: 'error', text: 'Failed to fetch attendance data' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${BACKEND_URL}/attendance/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      setMessage({
        type: 'success',
        text: `Upload successful! Employees: ${result.employeesCreated} created, ${result.employeesUpdated} updated. Attendance: ${result.attendanceCreated} records.`,
      });
      fetchData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatTime = (dateStr?: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const filteredRecords = records.filter(record =>
    record.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.employee.employeeId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto-hide messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">View Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">View and analyze attendance records</p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload Excel
          </button>
        </div>
      </div>

      {/* Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-md ${
              message.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 shadow-lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* From Date */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" /> From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all"
            />
          </div>

          {/* To Date */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" /> To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all"
            />
          </div>

          {/* Employee Type */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" /> Type
            </label>
            <select
              value={employeeTypeFilter}
              onChange={(e) => setEmployeeTypeFilter(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="ON_ROLL">On Roll</option>
              <option value="OFF_ROLL">Off Roll</option>
            </select>
          </div>

          {/* Search */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Search className="w-3.5 h-3.5" /> Search
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* View Toggle */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              View Mode
            </label>
            <div className="flex bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode('records')}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'records'
                    ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Records
              </button>
              <button
                onClick={() => setViewMode('summary')}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'summary'
                    ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Summary
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4"
        >
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.summary.totalRecords}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Records</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-green-600">{summary.summary.presentCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Present</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600">{summary.summary.absentCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Absent</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Coffee className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600">{summary.summary.leaveCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Leave</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Sun className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-blue-600">{summary.summary.weeklyOffCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Weekly Off</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Clock className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-600">{summary.summary.halfDayCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Half Day</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Timer className="w-4 h-4 text-indigo-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-indigo-600">{summary.summary.totalWorkingHours.toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Hours</p>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{summary.summary.totalOvertimeHours.toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">OT Hours</p>
          </div>
        </motion.div>
      )}

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl shadow-lg overflow-hidden"
      >
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-4 border-brandRed/30 border-t-brandRed rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading attendance data...</p>
          </div>
        ) : viewMode === 'records' ? (
          /* Records View */
          filteredRecords.length === 0 ? (
            <div className="p-12 text-center">
              <FileSpreadsheet className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Attendance Records</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Upload an Excel file or take attendance to see records here</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brandRed text-white rounded-lg font-medium"
              >
                <Upload className="w-4 h-4" />
                Upload Excel
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">In Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Out Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Hrs</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">OT Hrs</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(record.date)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                            record.employee.employeeType === 'ON_ROLL' ? 'bg-blue-500' : 'bg-amber-500'
                          }`}>
                            {record.employee.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">{record.employee.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{record.employee.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                          record.employee.employeeType === 'ON_ROLL'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.employee.employeeType === 'ON_ROLL' ? 'On Roll' : 'Off Roll'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusColors[record.status]}`}>
                          {statusLabels[record.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                          {formatTime(record.inTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                          {formatTime(record.outTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                          {record.totalHours.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono font-semibold ${
                          record.overtimeHours > 0 ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {record.overtimeHours > 0 ? `+${record.overtimeHours.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                          record.source === 'manual'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-indigo-100 text-indigo-600'
                        }`}>
                          {record.source === 'manual' ? 'Manual' : 'Excel'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Summary View */
          summary && summary.employeeStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Present Days</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Absent Days</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Leave Days</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Hours</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">OT Hours</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                  {summary.employeeStats.map((stat) => {
                    const totalDays = stat.presentDays + stat.absentDays + stat.leaveDays;
                    const attendancePercent = totalDays > 0 ? ((stat.presentDays / totalDays) * 100).toFixed(1) : '0';

                    return (
                      <tr key={stat.employee.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                              stat.employee.employeeType === 'ON_ROLL' ? 'bg-blue-500' : 'bg-amber-500'
                            }`}>
                              {stat.employee.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{stat.employee.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {stat.employee.employeeId} • {stat.employee.designation || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                            stat.employee.employeeType === 'ON_ROLL'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {stat.employee.employeeType === 'ON_ROLL' ? 'On Roll' : 'Off Roll'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold text-green-600">{stat.presentDays}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold text-red-600">{stat.absentDays}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold text-amber-600">{stat.leaveDays}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold text-gray-900 dark:text-white">{stat.totalHours.toFixed(1)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-lg font-bold ${stat.overtimeHours > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {stat.overtimeHours > 0 ? `+${stat.overtimeHours.toFixed(1)}` : '0'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  parseFloat(attendancePercent) >= 90
                                    ? 'bg-green-500'
                                    : parseFloat(attendancePercent) >= 75
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${attendancePercent}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              {attendancePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Summary Data</h3>
              <p className="text-gray-500 dark:text-gray-400">Add attendance records to see employee summaries</p>
            </div>
          )
        )}
      </motion.div>
    </div>
  );
}
