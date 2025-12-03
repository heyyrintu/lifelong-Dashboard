'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '@/components/common/PageHeader';
import { Upload as UploadIcon, File, AlertCircle, CheckCircle2, Trash2, Eye } from 'lucide-react';

interface UploadInfo {
  uploadId: string;
  fileName: string;
  uploadedAt: string;
  rowsInserted: number;
  status: string;
  type?: 'item-master' | 'inbound' | 'outbound' | 'inventory';
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [uploads, setUploads] = useState<UploadInfo[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);

  useEffect(() => {
    fetchUploads();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.name.endsWith('.csv')
      ) {
        setSelectedFile(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const fetchUploads = async () => {
    try {
      setUploadsLoading(true);
      
      // Fetch from outbound, inbound, and inventory endpoints
      const [outboundResponse, inboundResponse, inventoryResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/outbound/uploads`),
        fetch(`${BACKEND_URL}/inbound/uploads`),
        fetch(`${BACKEND_URL}/inventory/uploads`),
      ]);
      
      let allUploads: UploadInfo[] = [];
      
      if (outboundResponse.ok) {
        const outboundUploads: UploadInfo[] = await outboundResponse.json();
        allUploads = [...allUploads, ...outboundUploads.map(u => ({ ...u, type: 'outbound' as const }))];
      }
      
      if (inboundResponse.ok) {
        const inboundUploads: UploadInfo[] = await inboundResponse.json();
        allUploads = [...allUploads, ...inboundUploads];
      }
      
      if (inventoryResponse.ok) {
        const inventoryUploads: UploadInfo[] = await inventoryResponse.json();
        allUploads = [...allUploads, ...inventoryUploads];
      }
      
      // Sort by upload date (newest first)
      allUploads.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      
      setUploads(allUploads);
    } catch (err: any) {
      console.error('Failed to fetch uploads:', err.message);
    } finally {
      setUploadsLoading(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string, fileName: string, uploadType?: string) => {
    if (!window.confirm(`Are you sure you want to delete "${fileName}"? This will remove all data from this upload.`)) {
      return;
    }

    try {
      // Determine the correct endpoint based on upload type
      let endpoint = `${BACKEND_URL}/outbound/uploads/${uploadId}`;
      if (uploadType === 'inbound') {
        endpoint = `${BACKEND_URL}/inbound/uploads/${uploadId}`;
      } else if (uploadType === 'inventory') {
        endpoint = `${BACKEND_URL}/inventory/uploads/${uploadId}`;
      }

      const response = await fetch(endpoint, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete upload');
      }

      // Refresh uploads list
      await fetchUploads();
      alert('Upload deleted successfully');
    } catch (err: any) {
      alert(`Failed to delete upload: ${err.message}`);
    }
  };

  const handleViewUpload = (uploadId: string, uploadType?: string) => {
    // Navigate to appropriate page based on upload type
    if (uploadType === 'inbound') {
      window.location.href = `/inbound?uploadId=${uploadId}`;
    } else if (uploadType === 'item-master') {
      // Item master doesn't have a dedicated view, show alert
      alert('Item Master data is used for CBM calculations across the system.');
    } else if (uploadType === 'inventory') {
      window.location.href = `/inventory?uploadId=${uploadId}`;
    } else {
      window.location.href = `/outbound?uploadId=${uploadId}`;
    }
  };

  const handleProcess = async () => {
    if (!selectedFile || !fileType) return;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      let endpoint = '';
      let successMessage = '';

      // Determine endpoint based on file type
      switch (fileType) {
        case 'item-master':
          endpoint = `${BACKEND_URL}/inbound/item-master/upload`;
          break;
        case 'inbound':
          endpoint = `${BACKEND_URL}/inbound/upload`;
          break;
        case 'outbound':
          endpoint = `${BACKEND_URL}/outbound/upload`;
          break;
        case 'inventory':
          endpoint = `${BACKEND_URL}/inventory/upload`;
          break;
        default:
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Upload failed');
      }

      const result = await response.json();
      
      // Set success message based on file type
      if (fileType === 'item-master') {
        successMessage = `Item Master updated! Rows processed: ${result.rowsProcessed}`;
      } else if (fileType === 'inbound') {
        successMessage = `Inbound upload processed! Rows inserted: ${result.rowsInserted}`;
      } else if (fileType === 'inventory') {
        const dateInfo = result.dateRange 
          ? ` (Date range: ${result.dateRange.minDate || 'N/A'} to ${result.dateRange.maxDate || 'N/A'})`
          : '';
        successMessage = `Inventory upload processed! Rows inserted: ${result.rowsInserted}${dateInfo}`;
      } else {
        successMessage = `Upload successful! Rows inserted: ${result.rowsInserted}`;
      }
      
      alert(successMessage);
      
      // Reset form and refresh uploads
      setSelectedFile(null);
      setFileType('');
      await fetchUploads();
    } catch (error: any) {
      alert(`Upload failed: ${error.message || 'Please check the file format and try again.'}`);
      console.error('Upload error:', error);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload card */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient blob */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-brandRed/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-6 relative z-10">Upload File</h3>

            {/* Drag and drop area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative z-10 border-2 border-dashed rounded-xl p-12 text-center transition-all backdrop-blur-sm
                ${
                  isDragging
                    ? 'border-brandRed bg-brandRed/10 dark:bg-brandRed/20 shadow-lg shadow-brandRed/20'
                    : 'border-gray-300/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/40 hover:border-brandRed/50 dark:hover:border-slate-600 hover:bg-white/60 dark:hover:bg-slate-900/60'
                }
              `}
            >
              <UploadIcon
                className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-brandRed' : 'text-gray-400 dark:text-slate-600'}`}
              />
              <h4 className="text-lg font-medium text-gray-900 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop file here' : 'Drag and drop your file here'}
              </h4>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">or</p>

              <motion.label
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-brandRed to-red-600 hover:from-red-600 hover:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 text-white rounded-xl cursor-pointer transition-all font-semibold shadow-lg shadow-brandRed/25 hover:shadow-brandRed/40"
              >
                <UploadIcon className="w-4 h-4 mr-2" />
                Browse Files
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </motion.label>

              <p className="text-xs text-gray-500 dark:text-slate-500 mt-4">
                Supported formats: .xlsx, .xls, .csv (Max size: 10MB)
              </p>
            </div>

            {/* Selected file display */}
            {selectedFile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 mt-6 p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50 rounded-xl shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-500/20 dark:to-green-600/20 rounded-lg shadow-sm">
                      <File className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-200">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                  >
                    Remove
                  </button>
                </div>
              </motion.div>
            )}

            {/* File type selection */}
            <div className="mt-6 relative z-10">
              <label className="block text-sm font-bold text-gray-900 dark:text-slate-200 mb-3">
                Select File Type <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {[
                  { value: 'item-master', label: 'Item Master File', desc: 'Item master data with CBM information' },
                  { value: 'inbound', label: 'Inbound File', desc: 'Fresh Receipt and GRN data with CBM calculations' },
                  {
                    value: 'outbound',
                    label: 'Outbound File',
                    desc: 'Sales orders and dispatch data',
                  },
                  {
                    value: 'inventory',
                    label: 'Inventory File (Daily Stock Analytics)',
                    desc: 'Daily stock data with date columns (H→KL)',
                  },
                  { value: 'billing', label: 'Billing File', desc: 'Invoice and billing data' },
                ].map((type) => (
                  <motion.label
                    key={type.value}
                    whileHover={{ scale: 1.01, x: 4 }}
                    className={`relative flex items-start p-4 border backdrop-blur-sm rounded-xl cursor-pointer transition-all duration-200 ${
                      (type.value === 'item-master' || type.value === 'inbound' || type.value === 'outbound' || type.value === 'inventory') 
                        ? 'bg-green-50/80 dark:bg-green-500/10 border-green-200/50 dark:border-green-500/30 hover:bg-green-100/80 dark:hover:bg-green-500/15 hover:border-green-300 dark:hover:border-green-500/40 shadow-sm' 
                        : 'bg-white/40 dark:bg-slate-900/40 border-gray-200/50 dark:border-slate-700/50 hover:bg-white/60 dark:hover:bg-slate-900/60 hover:border-brandRed/30 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="fileType"
                      value={type.value}
                      checked={fileType === type.value}
                      onChange={(e) => setFileType(e.target.value)}
                      className="mt-1 text-brandRed focus:ring-brandRed"
                    />
                    <div className="ml-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-200">
                        {type.label}
                        {(type.value === 'item-master' || type.value === 'inbound' || type.value === 'outbound' || type.value === 'inventory') && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-green-100 to-green-200 dark:from-green-900/40 dark:to-green-800/40 text-green-700 dark:text-green-400 rounded-full shadow-sm">
                            Available
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-slate-500">{type.desc}</p>
                    </div>
                  </motion.label>
                ))}
              </div>
            </div>

            {/* Process button */}
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98, translateY: 0 }}
              onClick={handleProcess}
              disabled={!selectedFile || !fileType}
              className="relative z-10 w-full mt-6 px-6 py-3 bg-gradient-to-r from-brandRed to-red-600 hover:from-red-600 hover:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:text-gray-500 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg shadow-brandRed/25 hover:shadow-brandRed/40 disabled:shadow-none"
            >
              Process File
            </motion.button>
          </motion.div>
        </div>

        {/* Instructions card */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient blob */}
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4 relative z-10">Instructions</h3>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-slate-300 relative z-10">
              <li className="flex items-start gap-2">
                <span className="text-brandRed mt-0.5 font-bold">•</span>
                <span>Ensure your Excel file follows the standard template format</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brandRed mt-0.5 font-bold">•</span>
                <span>Select the correct file type before processing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brandRed mt-0.5 font-bold">•</span>
                <span>File size should not exceed 10MB</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brandRed mt-0.5 font-bold">•</span>
                <span>Data validation will be performed automatically</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brandRed mt-0.5 font-bold">•</span>
                <span>Processing may take a few minutes for large files</span>
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient blob */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            <div className="flex items-center justify-between mb-6 relative z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Uploaded Files</h3>
              <span className="px-3 py-1 bg-gray-100/80 dark:bg-slate-700/80 backdrop-blur-sm rounded-lg text-sm font-semibold text-gray-700 dark:text-slate-300 border border-gray-200/50 dark:border-slate-600/50">
                {uploads.length} file{uploads.length !== 1 ? 's' : ''} uploaded
              </span>
            </div>
            
            {uploadsLoading ? (
              <div className="text-center py-12 relative z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-brandRed border-t-transparent mx-auto mb-4"></div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Loading uploads...</p>
              </div>
            ) : uploads.length === 0 ? (
              <div className="text-center py-12 relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <File className="w-8 h-8 text-gray-400 dark:text-slate-500" />
                </div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2">No files uploaded yet</h4>
                <p className="text-xs text-gray-500 dark:text-slate-500">Upload your first file to see it here</p>
              </div>
            ) : (
              <div className="space-y-3 relative z-10">
                {uploads.map((upload) => (
                  <motion.div
                    key={upload.uploadId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.01, y: -2 }}
                    className="group flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50 rounded-xl hover:bg-white/80 dark:hover:bg-slate-900/60 hover:border-brandRed/50 dark:hover:border-slate-600 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-brandRed/20 to-brandRed/10 dark:from-brandRed/30 dark:to-brandRed/20 rounded-lg flex items-center justify-center shadow-sm border border-brandRed/20">
                          <File className="w-5 h-5 text-brandRed dark:text-brandRed" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-200 truncate" title={upload.fileName}>
                            {upload.fileName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                              upload.type === 'item-master' 
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                : upload.type === 'inbound'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : upload.type === 'inventory'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                            }`}>
                              {upload.type === 'item-master' ? 'Item Master' : upload.type === 'inbound' ? 'Inbound' : upload.type === 'inventory' ? 'Inventory' : 'Outbound'}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                              {upload.status}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <span className="font-medium">{upload.rowsInserted}</span>
                              <span>rows</span>
                              <span>•</span>
                              <span>{new Date(upload.uploadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleViewUpload(upload.uploadId, upload.type)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                        title="View this upload's data"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteUpload(upload.uploadId, upload.fileName, upload.type)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                        title="Delete this upload"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Toast notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-200">Processing Started</p>
              <p className="text-xs text-gray-600 dark:text-slate-400">
                File processing logic will be added in Phase 2
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
