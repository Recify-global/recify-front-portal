import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  return (
    <div className={cn('bg-card rounded-2xl p-5 shadow-elegant border border-border/50 space-y-3', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}
