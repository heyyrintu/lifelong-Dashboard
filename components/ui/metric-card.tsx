import { memo } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: LucideIcon;
    className?: string;
}

export const MetricCard = memo(function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    className,
}: MetricCardProps) {
    return (
        <div
            className={cn(
                "w-full p-1 rounded-xl relative isolate overflow-hidden min-h-[168px]",
                "bg-white/15 dark:bg-slate-800/50",
                "bg-gradient-to-br from-black/15 to-black/[0.06] dark:from-white/[0.06] dark:to-transparent",
                "backdrop-blur-xl backdrop-saturate-[180%]",
                "border border-black/10 dark:border-slate-700/50",
                "shadow-[0_8px_16px_rgb(0_0_0_/_0.15)] dark:shadow-[0_8px_16px_rgb(0_0_0_/_0.3)]",
                "will-change-transform",
                "transition-all duration-300",
                className
            )}
        >
            <div
                className={cn(
                    "w-full h-full p-6 rounded-lg relative",
                    "bg-gradient-to-br from-black/[0.05] to-transparent dark:from-slate-700/30 dark:to-slate-800/10",
                    "backdrop-blur-md backdrop-saturate-150",
                    "border border-black/[0.05] dark:border-slate-600/30",
                    "text-black/90 dark:text-white",
                    "shadow-sm",
                    "will-change-transform",
                    "before:absolute before:inset-0 before:bg-gradient-to-br before:from-black/[0.02] before:to-black/[0.01] dark:before:from-white/[0.02] dark:before:to-transparent before:opacity-0 before:transition-opacity before:pointer-events-none",
                    "hover:before:opacity-100"
                )}
            >
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-4 bg-brandRed rounded-full"></div>
                            <p className="text-sm font-medium text-black/70 dark:text-slate-300">
                                {title}
                            </p>
                        </div>
                        <p className="text-[31px] font-bold text-black dark:text-white mt-2">
                            {value}
                        </p>
                        {subtitle && (
                            <p className="text-xs text-black/60 dark:text-slate-400">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {Icon && (
                        <div className="bg-brandRed/10 dark:bg-brandRed/20 p-3 rounded-lg">
                            <Icon className="w-6 h-6 text-brandRed dark:text-brandRed" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
