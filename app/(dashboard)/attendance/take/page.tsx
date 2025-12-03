'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  Users,
  Clock,
  Calendar,
  Search,
  Save,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Coffee,
  Sun,
  AlertCircle,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation?: string;
  department?: string;
  vendor?: string;
  contact?: string;
  dateOfJoining?: string;
  employeeType: 'ON_ROLL' | 'OFF_ROLL';
  location: string;
  isActive: boolean;
}

interface AttendanceEntry {
  employeeId: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'WEEKLY_OFF' | 'HALF_DAY';
  inTime: string;
  outTime: string;
  remarks: string;
}

const statusOptions = [
  { value: 'PRESENT', label: 'Present', icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'ABSENT', label: 'Absent', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'LEAVE', label: 'Leave', icon: Coffee, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'WEEKLY_OFF', label: 'W/Off', icon: Sun, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'HALF_DAY', label: 'Half Day', icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

export default function TakeAttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<'ALL' | 'ON_ROLL' | 'OFF_ROLL'>('ALL');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [attendanceEntries, setAttendanceEntries] = useState<Record<string, AttendanceEntry>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New employee form state
  const [newEmployee, setNewEmployee] = useState({
    employeeId: '',
    name: '',
    designation: '',
    department: '',
    vendor: '',
    contact: '',
    dateOfJoining: '',
    employeeType: 'OFF_ROLL' as 'ON_ROLL' | 'OFF_ROLL',
    location: 'Farukh Nagar',
  });

  useEffect(() => {
    fetchEmployees();
  }, [employeeTypeFilter]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (employeeTypeFilter !== 'ALL') {
        params.append('employeeType', employeeTypeFilter);
      }
      params.append('isActive', 'true');

      const response = await fetch(`${BACKEND_URL}/attendance/employees?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch employees');

      const data = await response.json();
      setEmployees(data);

      // Initialize attendance entries
      const entries: Record<string, AttendanceEntry> = {};
      data.forEach((emp: Employee) => {
        entries[emp.id] = {
          employeeId: emp.id,
          status: 'PRESENT',
          inTime: '09:00',
          outTime: '18:00',
          remarks: '',
        };
      });
      setAttendanceEntries(entries);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setMessage({ type: 'error', text: 'Failed to fetch employees' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/attendance/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add employee');
      }

      setMessage({ type: 'success', text: 'Employee added successfully!' });
      setShowAddEmployee(false);
      setNewEmployee({
        employeeId: '',
        name: '',
        designation: '',
        department: '',
        vendor: '',
        contact: '',
        dateOfJoining: '',
        employeeType: 'OFF_ROLL',
        location: 'Farukh Nagar',
      });
      fetchEmployees();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;

    try {
      const response = await fetch(`${BACKEND_URL}/attendance/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEmployee),
      });

      if (!response.ok) throw new Error('Failed to update employee');

      setMessage({ type: 'success', text: 'Employee updated successfully!' });
      setEditingEmployee(null);
      fetchEmployees();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      const response = await fetch(`${BACKEND_URL}/attendance/employees/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete employee');

      setMessage({ type: 'success', text: 'Employee deleted successfully!' });
      fetchEmployees();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      const attendances = Object.values(attendanceEntries).map(entry => ({
        employeeId: entry.employeeId,
        status: entry.status,
        inTime: entry.status === 'PRESENT' || entry.status === 'HALF_DAY' ? entry.inTime : undefined,
        outTime: entry.status === 'PRESENT' || entry.status === 'HALF_DAY' ? entry.outTime : undefined,
        remarks: entry.remarks,
      }));

      const response = await fetch(`${BACKEND_URL}/attendance/records/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          attendances,
        }),
      });

      if (!response.ok) throw new Error('Failed to save attendance');

      const result = await response.json();
      setMessage({
        type: 'success',
        text: `Attendance saved! ${result.created} records processed.`,
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const updateAttendanceEntry = (employeeId: string, field: keyof AttendanceEntry, value: string) => {
    setAttendanceEntries(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: value,
      },
    }));
  };

  const calculateTotalHours = (inTime: string, outTime: string): string => {
    if (!inTime || !outTime) return '0.00';
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (totalMinutes < 0) return '0.00';
    return (totalMinutes / 60).toFixed(2);
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase())
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Take Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Mark daily attendance for employees</p>
        </div>
        <button
          onClick={() => setShowAddEmployee(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl font-semibold shadow-lg shadow-brandRed/25 hover:shadow-brandRed/40 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date & Filters */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 shadow-lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" /> Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all"
            />
          </div>

          {/* Employee Type Filter */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" /> Employee Type
            </label>
            <select
              value={employeeTypeFilter}
              onChange={(e) => setEmployeeTypeFilter(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="ALL">All Employees</option>
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
                placeholder="Search by name or ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Actions
            </label>
            <div className="flex gap-2">
              <button
                onClick={fetchEmployees}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={handleSaveAttendance}
                disabled={saving || filteredEmployees.length === 0}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Attendance Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl shadow-lg overflow-hidden"
      >
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-4 border-brandRed/30 border-t-brandRed rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Employees Found</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Add employees to start taking attendance</p>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brandRed text-white rounded-lg font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">In Time</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Out Time</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">OT Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remarks</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                {filteredEmployees.map((employee) => {
                  const entry = attendanceEntries[employee.id];
                  if (!entry) return null;

                  const totalHours = parseFloat(calculateTotalHours(entry.inTime, entry.outTime));
                  const otHours = Math.max(0, totalHours - 9).toFixed(2);
                  const showTimeInputs = entry.status === 'PRESENT' || entry.status === 'HALF_DAY';

                  return (
                    <tr key={employee.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                            employee.employeeType === 'ON_ROLL' ? 'bg-blue-500' : 'bg-amber-500'
                          }`}>
                            {employee.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{employee.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {employee.employeeId} • {employee.designation || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={entry.status}
                          onChange={(e) => updateAttendanceEntry(employee.id, 'status', e.target.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border outline-none cursor-pointer transition-all ${
                            statusOptions.find(s => s.value === entry.status)?.color || ''
                          }`}
                        >
                          {statusOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={entry.inTime}
                          onChange={(e) => updateAttendanceEntry(employee.id, 'inTime', e.target.value)}
                          disabled={!showTimeInputs}
                          className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={entry.outTime}
                          onChange={(e) => updateAttendanceEntry(employee.id, 'outTime', e.target.value)}
                          disabled={!showTimeInputs}
                          className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-semibold ${
                          showTimeInputs ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                        }`}>
                          {showTimeInputs ? totalHours.toFixed(2) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-semibold ${
                          parseFloat(otHours) > 0 ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {showTimeInputs && parseFloat(otHours) > 0 ? `+${otHours}` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={entry.remarks}
                          onChange={(e) => updateAttendanceEntry(employee.id, 'remarks', e.target.value)}
                          placeholder="Add remarks..."
                          className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingEmployee(employee)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(employee.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {showAddEmployee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddEmployee(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Employee</h2>
                <button
                  onClick={() => setShowAddEmployee(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee ID *</label>
                    <input
                      type="text"
                      value={newEmployee.employeeId}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, employeeId: e.target.value }))}
                      placeholder="e.g., F00000001"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                    <input
                      type="text"
                      value={newEmployee.name}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Designation</label>
                    <input
                      type="text"
                      value={newEmployee.designation}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, designation: e.target.value }))}
                      placeholder="e.g., Picker"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                    <input
                      type="text"
                      value={newEmployee.department}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, department: e.target.value }))}
                      placeholder="e.g., Operations"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
                    <input
                      type="text"
                      value={newEmployee.vendor}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, vendor: e.target.value }))}
                      placeholder="e.g., KBR"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact</label>
                    <input
                      type="text"
                      value={newEmployee.contact}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, contact: e.target.value }))}
                      placeholder="Phone number"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Joining</label>
                    <input
                      type="date"
                      value={newEmployee.dateOfJoining}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, dateOfJoining: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee Type</label>
                    <select
                      value={newEmployee.employeeType}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, employeeType: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    >
                      <option value="OFF_ROLL">Off Roll</option>
                      <option value="ON_ROLL">On Roll</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                  <input
                    type="text"
                    value={newEmployee.location}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g., Farukh Nagar"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddEmployee(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployee}
                  disabled={!newEmployee.employeeId || !newEmployee.name}
                  className="px-4 py-2 bg-gradient-to-r from-brandRed to-red-600 text-white rounded-lg font-medium shadow-lg shadow-brandRed/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Employee
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Employee Modal */}
      <AnimatePresence>
        {editingEmployee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingEmployee(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit Employee</h2>
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee ID</label>
                    <input
                      type="text"
                      value={editingEmployee.employeeId}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, employeeId: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={editingEmployee.name}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Designation</label>
                    <input
                      type="text"
                      value={editingEmployee.designation || ''}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, designation: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                    <input
                      type="text"
                      value={editingEmployee.department || ''}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, department: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
                    <input
                      type="text"
                      value={editingEmployee.vendor || ''}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, vendor: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact</label>
                    <input
                      type="text"
                      value={editingEmployee.contact || ''}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, contact: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee Type</label>
                    <select
                      value={editingEmployee.employeeType}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, employeeType: e.target.value as any } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    >
                      <option value="OFF_ROLL">Off Roll</option>
                      <option value="ON_ROLL">On Roll</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Active Status</label>
                    <select
                      value={editingEmployee.isActive ? 'true' : 'false'}
                      onChange={(e) => setEditingEmployee(prev => prev ? { ...prev, isActive: e.target.value === 'true' } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed outline-none dark:bg-slate-800"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateEmployee}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium shadow-lg shadow-blue-500/25"
                >
                  Update Employee
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
