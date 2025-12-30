'use client';

import { useMemo, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  ArrowDownToLine,
  Package,
  ArrowUpFromLine,
  Upload,
  FileText,
  X,
  UserCheck,
  ClipboardList,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { Sidebar as SidebarContainer, SidebarBody, SidebarLink } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  name: string;
  path: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  {
    name: 'Operational Dashboard',
    path: '/summary',
    icon: LayoutDashboard,
  },
  {
    name: 'Inbound',
    path: '/inbound',
    icon: ArrowDownToLine,
  },
  {
    name: 'Inventory',
    path: '/inventory',
    icon: Package,
  },
  {
    name: 'Outbound',
    path: '/outbound',
    icon: ArrowUpFromLine,
  },
  {
    name: 'Upload',
    path: '/upload',
    icon: Upload,
    adminOnly: true,
  },
  {
    name: 'Billing',
    path: '/billing',
    icon: FileText,
    adminOnly: true,
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect to login even if logout fails
      router.push('/login');
    }
  }, [logout, router]);

  // Memoize filtered menu items to prevent recalculation on every render
  const visibleMenuItems = useMemo(() => 
    menuItems.filter(item => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  // Memoize click handler for mobile menu close
  const handleLinkClick = useCallback(() => {
    if (window.innerWidth < 1024) {
      onClose();
    }
  }, [onClose]);

  const Logo = () => {
    return (
      <div className="bg-white backdrop-blur-md rounded-[4px] px-2 py-0.5 my-0.5 shadow-lg border border-white/20 transform hover:scale-105 transition-all duration-300 hover:bg-white flex items-center justify-start gap-0 font-normal text-sm py-0 relative z-20">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-bold text-lg text-gray-900 whitespace-pre drop-shadow-sm tracking-tight"
        >
          Operational Dashboard
        </motion.span>
      </div>
    );
  };

  const LogoIcon = () => {
    return (
      <div className="flex items-center justify-center w-full font-normal text-sm text-white py-0 relative z-20">
      </div>
    );
  };

  return (
    <SidebarContainer open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-10">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <div className={cn("flex flex-col gap-2", open ? "mt-8" : "mt-0")}>
            {visibleMenuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <SidebarLink
                  key={item.path}
                  link={{
                    label: item.name,
                    href: item.path,
                    icon: (
                      <item.icon className={cn(
                        "h-5 w-5 flex-shrink-0",
                        isActive ? "text-white" : "text-white/80"
                      )} />
                    ),
                  }}
                  className={cn(
                    "rounded-xl p-2 transition-all duration-300 hover:bg-white/15 hover:shadow-sm group border border-transparent",
                    isActive && "bg-white/25 font-semibold shadow-inner border-white/20 backdrop-blur-sm",
                    !open ? "justify-center" : ""
                  )}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    router.push(item.path);
                    handleLinkClick();
                  }}
                />
              );
            })}
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <div className="h-px bg-white/20 w-full my-2" />
          <SidebarLink
            link={{
              label: user?.name || 'User',
              href: '#',
              icon: (
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              ),
            }}
            className="hover:bg-white/10 rounded-md"
          />
          <SidebarLink
            link={{
              label: 'Logout',
              href: '#',
              icon: <LogOut className="h-5 w-5 text-white/70" />,
            }}
            className="hover:bg-red-500/20 hover:text-red-100 rounded-md"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              handleLogout();
            }}
          />
        </div>
      </SidebarBody>
    </SidebarContainer>
  );
}


