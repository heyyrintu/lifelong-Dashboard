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
    <header className="sticky top-0 z-10 w-full border-b border-amber-300/30 bg-gradient-to-r from-[#F59E0B] via-[#F59E0B]/90 to-[#FBBF24]/90 backdrop-blur-md transition-all duration-300" style={{ boxShadow: '0 4px 30px rgba(245, 158, 11, 0.5), 0 8px 60px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}>
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: menu + logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center">
             <div className="bg-white/75 backdrop-blur-md rounded-[7px] px-4 py-2 my-0.5 shadow-lg border border-white/20 transform hover:scale-105 transition-all duration-300 hover:bg-white/85">
               <img 
                src="https://12d9mn3oyd.ucarecd.net/d13ae91b-1651-44ce-8457-7c7d74f43847/Untitleddesign.png" 
                alt="Drona Lifelong" 
                className="h-10 w-auto object-contain drop-shadow-sm"
                style={{ clipPath: 'inset(10px 0 10px 0)' }}
              />
             </div>
          </div>
        </div>

        {/* Center: page name (Hidden on mobile, visible on larger screens) */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <h1 className="text-3xl font-bold text-white">
            {getPageName()}
          </h1>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3">
          {/* Selected Date Display */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5
            bg-white/10 hover:bg-white/20
            border border-white/20
            rounded-full transition-all duration-200">
            <Calendar className="w-4 h-4 text-white/90" />
            <time
              dateTime={label}
              className="text-sm font-medium text-white truncate max-w-[150px] lg:max-w-[240px]"
              title={label}
            >
              {displayedLabel}
            </time>
          </div>

          {/* Theme Toggle */}
          <div className="bg-white/10 hover:bg-white/20
            border border-white/20
            rounded-full p-1 transition-all duration-200">
            <ThemeToggle />
          </div>
        </div>
      </div>
      
      {/* Mobile Page Name (Visible only on small screens) */}
      <div className="md:hidden px-4 pb-3">
         <h1 className="text-lg font-semibold text-white">
            {getPageName()}
          </h1>
      </div>
    </header>
  );
}
