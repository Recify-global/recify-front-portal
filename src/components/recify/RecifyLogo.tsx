import logo from '@/assets/logo.png';

interface RecifyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const sizeClasses = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
};

export function RecifyLogo({ size = 'md', showIcon = true }: RecifyLogoProps) {
  return (
    <div className="flex items-center gap-2">
      {showIcon && (
        <img 
          src={logo} 
          alt="Recify Logo" 
          className={`${sizeClasses[size]} w-auto`}
        />
      )}
      <span className={`${size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-4xl'} font-bold tracking-tight text-foreground`}>
        Recify
      </span>
    </div>
  );
}
