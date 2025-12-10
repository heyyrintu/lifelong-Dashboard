'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface HealthStatus {
  frontend: boolean;
  backend: boolean;
  database: boolean;
  lastCheck: Date;
}

export function HealthIndicator() {
  const [health, setHealth] = useState<HealthStatus>({
    frontend: true,
    backend: true,
    database: true,
    lastCheck: new Date(),
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

  const checkHealth = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      const data = await response.json();
      
      setHealth({
        frontend: true,
        backend: response.ok,
        database: data.database === 'connected',
        lastCheck: new Date(),
      });
    } catch {
      setHealth({
        frontend: true,
        backend: false,
        database: false,
        lastCheck: new Date(),
      });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
    // Only run on mount - checkHealth is stable and doesn't need to be in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allHealthy = health.frontend && health.backend && health.database;
  const hasIssues = !health.backend || !health.database;

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          allHealthy
            ? 'bg-green-100 text-green-800 hover:bg-green-200'
            : hasIssues
            ? 'bg-red-100 text-red-800 hover:bg-red-200'
            : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
        }`}
        title="Click to view health details"
      >
        {allHealthy ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : hasIssues ? (
          <XCircle className="w-4 h-4" />
        ) : (
          <AlertTriangle className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {allHealthy ? 'All Systems OK' : 'System Issues'}
        </span>
      </button>

      {isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
            <div className="p-4">
              <h3 className="font-bold text-gray-900 mb-3">System Health</h3>
              
              <div className="space-y-2">
                <HealthItem
                  label="Frontend"
                  healthy={health.frontend}
                  description="Next.js App"
                />
                <HealthItem
                  label="Backend API"
                  healthy={health.backend}
                  description="NestJS Server"
                />
                <HealthItem
                  label="Database"
                  healthy={health.database}
                  description="PostgreSQL"
                />
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
                Last checked: {health.lastCheck.toLocaleTimeString()}
              </div>

              <a
                href="/health"
                className="mt-3 block w-full text-center px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => setIsExpanded(false)}
              >
                View Detailed Health
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HealthItem({ label, healthy, description }: { label: string; healthy: boolean; description: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <span className={`text-xs font-semibold ${healthy ? 'text-green-600' : 'text-red-600'}`}>
        {healthy ? 'OK' : 'DOWN'}
      </span>
    </div>
  );
}
