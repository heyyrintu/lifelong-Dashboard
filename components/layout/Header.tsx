'use client';

import { Menu, Calendar } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { useDateFilter } from '@/lib/date-filter-context';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { label } = useDateFilter();

  const formatSingleDate = (dateStr: string): string => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // DD-MM-YYYY
    const ddmmMatch = dateStr.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmMatch) {
      const dd = ddmmMatch[1].padStart(2, '0');
      const mm = ddmmMatch[2].padStart(2, '0');
      const yyyy = ddmmMatch[3];
      const iso = `${yyyy}-${mm}-${dd}T00:00:00Z`;
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      }
    }

    // YYYY-MM-DD
    const ymdMatch = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
      const yyyy = ymdMatch[1];
      const mm = String(Number(ymdMatch[2])).padStart(2, '0');
      const dd = String(Number(ymdMatch[3])).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}T00:00:00Z`;
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      }
    }

    return dateStr;
  };

  const formatLabelToFullDate = (lbl: string) => {
    if (!lbl) return '';
    
    // Handle special labels
    if (/All Dates/i.test(lbl) || /ALL/i.test(lbl)) {
      return lbl;
    }

    // Handle date ranges with " to " or " - "
    const rangeSplitRegex = /\s+to\s+|\s*-\s*/i;
    if (rangeSplitRegex.test(lbl)) {
      const parts = lbl.split(rangeSplitRegex);
      if (parts.length === 2) {
        return `${formatSingleDate(parts[0])} to ${formatSingleDate(parts[1])}`;
      }
      return lbl;
    }

    // Handle "From" prefix
    if (/^From\s+/i.test(lbl)) {
      const dateStr = lbl.replace(/^From\s+/i, '');
      return `From ${formatSingleDate(dateStr)}`;
    }

    // Handle "Up to" prefix
    if (/^Up to\s+/i.test(lbl)) {
      const dateStr = lbl.replace(/^Up to\s+/i, '');
      return `Up to ${formatSingleDate(dateStr)}`;
    }

    // Single date
    return formatSingleDate(lbl);
  };

  const displayedLabel = formatLabelToFullDate(label);

  const getPageName = () => {
    const routes: Record<string, string> = {
      '/summary': 'Quick Summary',
      '/inbound': 'Inbound',
      '/inventory': 'Inventory',
      '/outbound': 'Outbound',
      '/upload': 'Upload',
      '/billing': 'Billing',
    };
    return routes[pathname] || 'Dashboard';
  };

  return (
    <header className="sticky top-0 z-10 isolate overflow-hidden
      bg-white/5 dark:bg-slate-800/50
      bg-gradient-to-br from-black/5 to-black/[0.02] dark:from-white/[0.02] dark:to-transparent
      backdrop-blur-xl backdrop-saturate-[180%]
      border-b border-black/10 dark:border-slate-700/50
      shadow-[0_8px_16px_rgb(0_0_0_/_0.15)] dark:shadow-[0_8px_16px_rgb(0_0_0_/_0.3)]
      will-change-transform
      transition-all duration-300">
      <div className="flex items-center justify-between px-3 sm:px-6 py-4
        bg-gradient-to-br from-black/[0.05] to-transparent dark:from-slate-700/30 dark:to-slate-800/10
        backdrop-blur-md backdrop-saturate-150
        relative">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-gray-700 dark:text-slate-300" />
          </button>
          <div className="relative min-w-0">
            <h1 className="flex items-baseline gap-1 font-bold text-gray-900 dark:text-slate-100">
              <span className="text-lg sm:text-2xl whitespace-nowrap">Drona 🤝🏼 Lifelong /</span>
              <span className="text-base sm:text-xl text-gray-600 truncate">{getPageName()}</span>
            </h1>
            <div className="absolute bottom-0 left-0 h-1 w-16 rounded-full bg-gradient-to-r from-amber-400 via-amber-300/80 to-transparent opacity-90"></div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Selected Date Display */}
          <div className="flex items-center gap-2 px-3 py-2
            bg-white/80 dark:bg-slate-800/80
            backdrop-blur-md backdrop-saturate-150
            border border-gray-200/50 dark:border-slate-700/50
            rounded-xl shadow-sm hover:shadow-md
            transition-all duration-200">
            <Calendar className="w-4 h-4 text-gray-600 dark:text-slate-400" />
            <time
              dateTime={label}
              className="text-sm font-medium text-gray-700 dark:text-slate-300 truncate max-w-[240px]"
              title={label}
              aria-label={`Selected date: ${label}`}>
              {displayedLabel}
            </time>
          </div>

          {/* Theme Toggle */}
          <div className="bg-white/80 dark:bg-slate-800/80
            backdrop-blur-md backdrop-saturate-150
            border border-gray-200/50 dark:border-slate-700/50
            rounded-xl shadow-sm hover:shadow-md
            transition-all duration-200">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
