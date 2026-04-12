import { cn } from '@/lib/utils';
import { UtensilsCrossed, Car, Clipboard, Wrench, Building2, Laptop, Heart, Film } from 'lucide-react';

const categoryIcons: Record<string, React.ElementType> = {
  'Alimentación': UtensilsCrossed,
  'Transporte': Car,
  'Papelería': Clipboard,
  'Servicios': Wrench,
  'Operación': Building2,
  'Tecnología': Laptop,
  'Salud': Heart,
  'Entretenimiento': Film,
};

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const Icon = categoryIcons[category];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-secondary text-secondary-foreground', className)}>
      {Icon && <Icon size={12} />}
      {category}
    </span>
  );
}
