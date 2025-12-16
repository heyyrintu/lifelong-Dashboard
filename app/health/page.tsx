'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface HealthStatus {
  status: 'ok' | 'error' | 'loading';
  timestamp?: string;
  uptime?: number;
  database?: 'connected' | 'disconnected';
  environment?: string;
  message?: string;
}

export default function HealthCheckPage() {
  const [backendHealth, setBackendHealth] = useState<HealthStatus>({ status: 'loading' });
  const [frontendHealth, setFrontendHealth] = useState<HealthStatus>({ status: 'ok', timestamp: new Date().toISOString() });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

  const checkBackendHealth = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBackendHealth({
          status: 'ok',
          ...data,
        });
      } else {
        const data = await response.json().catch(() => ({}));
        setBackendHealth({
          status: 'error',
          message: data.message || `HTTP ${response.status}: ${response.statusText}`,
          ...data,
        });
      }
    } catch (error) {
      setBackendHealth({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to connect to backend',
      });
    }
  };

  const refresh = async () => {
    setIsRefreshing(true);
    setBackendHealth({ status: 'loading' });
    setFrontendHealth({ status: 'ok', timestamp: new Date().toISOString() });
    await checkBackendHealth();
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkBackendHealth();

    // Auto-refresh every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(interval);
  }, [checkBackendHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="w-6 h-6 text-green-500" />;
      case 'error':
        return <XCircle className="w-6 h-6 text-red-500" />;
      case 'loading':
        return <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />;
      default:
        return <AlertCircle className="w-6 h-6 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'loading':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ok':
        return 'Healthy';
      case 'error':
        return 'Unhealthy';
      case 'loading':
        return 'Checking...';
      default:
        return 'Unknown';
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const overallHealthy = frontendHealth.status === 'ok' && backendHealth.status === 'ok';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">System Health Check</h1>
              <p className="text-gray-600">Monitor the health of frontend and backend services</p>
            </div>
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Overall Status */}
        <div className={`p-6 rounded-xl border-2 mb-6 ${overallHealthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-3">
            {overallHealthy ? (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
            <div>
              <h2 className={`text-xl font-bold ${overallHealthy ? 'text-green-900' : 'text-red-900'}`}>
                {overallHealthy ? 'All Systems Operational' : 'System Issues Detected'}
              </h2>
              <p className={`text-sm ${overallHealthy ? 'text-green-700' : 'text-red-700'}`}>
                {overallHealthy ? 'Everything is running smoothly' : 'Some services require attention'}
              </p>
            </div>
          </div>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Frontend Health */}
          <div className={`p-6 rounded-xl border-2 ${getStatusColor(frontendHealth.status)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getStatusIcon(frontendHealth.status)}
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Frontend</h3>
                  <p className="text-sm text-gray-600">Next.js Application</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                frontendHealth.status === 'ok' 
                  ? 'bg-green-200 text-green-800' 
                  : 'bg-red-200 text-red-800'
              }`}>
                {getStatusText(frontendHealth.status)}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-gray-900">{frontendHealth.status.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Check:</span>
                <span className="font-medium text-gray-900">
                  {frontendHealth.timestamp ? new Date(frontendHealth.timestamp).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Environment:</span>
                <span className="font-medium text-gray-900">{process.env.NODE_ENV || 'development'}</span>
              </div>
            </div>
          </div>

          {/* Backend Health */}
          <div className={`p-6 rounded-xl border-2 ${getStatusColor(backendHealth.status)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getStatusIcon(backendHealth.status)}
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Backend API</h3>
                  <p className="text-sm text-gray-600">NestJS Server</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                backendHealth.status === 'ok' 
                  ? 'bg-green-200 text-green-800' 
                  : 'bg-red-200 text-red-800'
              }`}>
                {getStatusText(backendHealth.status)}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-gray-900">{backendHealth.status.toUpperCase()}</span>
              </div>
              {backendHealth.timestamp && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Check:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(backendHealth.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {backendHealth.uptime !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Uptime:</span>
                  <span className="font-medium text-gray-900">{formatUptime(backendHealth.uptime)}</span>
                </div>
              )}
              {backendHealth.database && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Database:</span>
                  <span className={`font-medium ${backendHealth.database === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                    {backendHealth.database.toUpperCase()}
                  </span>
                </div>
              )}
              {backendHealth.environment && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Environment:</span>
                  <span className="font-medium text-gray-900">{backendHealth.environment}</span>
                </div>
              )}
              {backendHealth.message && (
                <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-xs text-red-800 font-medium">Error:</p>
                  <p className="text-xs text-red-700 mt-1">{backendHealth.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Info */}
        <div className="mt-6 p-6 bg-white rounded-xl border-2 border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Configuration</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Backend URL:</span>
              <span className="font-mono text-gray-900">{BACKEND_URL}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Auto-refresh:</span>
              <span className="text-gray-900">Every 30 seconds</span>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        {backendHealth.status === 'error' && (
          <div className="mt-6 p-6 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-yellow-900 mb-2">Troubleshooting Steps</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                  <li>Verify the backend server is running</li>
                  <li>Check if DATABASE_URL is properly configured</li>
                  <li>Review backend logs for connection errors</li>
                  <li>Ensure the database server is accessible</li>
                  <li>Check firewall and network settings</li>
                  <li>See <code className="bg-yellow-100 px-1 rounded">DB_TROUBLESHOOTING.md</code> for detailed guide</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
