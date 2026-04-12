import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon, className }: MetricCardProps) {
  return (
    <div className={cn('bg-card rounded-2xl p-5 shadow-elegant border border-border/50 animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
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
