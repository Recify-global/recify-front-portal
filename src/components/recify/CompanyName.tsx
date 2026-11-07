import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type CompanyNameProps = HTMLAttributes<HTMLSpanElement>;

/** Keeps a company name out of automatic translation without blocking nearby labels. */
export function CompanyName({ className, ...props }: CompanyNameProps) {
  return (
    <span
      {...props}
      translate="no"
      className={cn('notranslate', className)}
    />
  );
}
