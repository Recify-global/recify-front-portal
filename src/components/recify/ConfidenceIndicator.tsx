import { cn } from '@/lib/utils';

interface ConfidenceIndicatorProps {
  value: number;
  className?: string;
}

export function ConfidenceIndicator({ value, className }: ConfidenceIndicatorProps) {
  const color = value >= 90 ? 'text-success' : value >= 70 ? 'text-warning' : 'text-destructive';
  const bgColor = value >= 90 ? 'bg-success' : value >= 70 ? 'bg-warning' : 'bg-destructive';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', bgColor)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn('text-xs font-medium', color)}>{value}%</span>
    </div>
  );
}
