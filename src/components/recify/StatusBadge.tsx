import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'analizado' | 'pendiente' | 'error';
  className?: string;
}

const statusConfig = {
  analizado: {
    label: 'Analizado',
    classes: 'bg-accent text-accent-foreground',
  },
  pendiente: {
    label: 'Pendiente',
    classes: 'bg-warning/10 text-warning',
  },
  error: {
    label: 'Error',
    classes: 'bg-destructive/10 text-destructive',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.classes, className)}>
      {config.label}
    </span>
  );
}
