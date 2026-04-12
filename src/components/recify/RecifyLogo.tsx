import { Receipt } from 'lucide-react';

interface RecifyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const sizeClasses = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
};

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 28,
};

export function RecifyLogo({ size = 'md', showIcon = true }: RecifyLogoProps) {
  return (
    <div className="flex items-center gap-2">
      {showIcon && (
        <div className="bg-gradient-primary rounded-xl p-1.5 flex items-center justify-center">
          <Receipt className="text-primary-foreground" size={iconSizes[size]} />
        </div>
      )}
      <span className={`${sizeClasses[size]} font-bold tracking-tight text-foreground`}>
        Recify
      </span>
    </div>
  );
}
