import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  className?: string;
  info?: string;
  infoLabel?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  className,
  info,
  infoLabel,
}: MetricCardProps) {
  return (
    <div className={cn('bg-card rounded-2xl p-5 shadow-elegant border border-border/50 animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {info ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={infoLabel ?? `Información sobre ${title}`}
                    >
                      <Info size={12} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {info}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="p-2.5 rounded-xl bg-accent text-accent-foreground">
          {icon}
        </div>
      </div>
    </div>
  );
}
