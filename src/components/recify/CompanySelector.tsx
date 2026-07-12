import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/use-companies';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function shortCompanyId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

interface CompanySelectorProps {
  collapsed?: boolean;
}

export function CompanySelector({ collapsed = false }: CompanySelectorProps) {
  const { companyId, setActiveCompany } = useAuth();
  const { companies, isLoading, isError, hasNames } = useCompanies();

  if (!companyId) return null;

  const activeNamed = companies.find((c) => c._id === companyId);
  const activeLabel = activeNamed?.name?.trim()
    ? activeNamed.name.trim()
    : 'Compañía actual';
  const activeTooltip = activeNamed?.name?.trim()
    ? activeNamed.name.trim()
    : shortCompanyId(companyId);

  const activeInList = companies.some((c) => c._id === companyId);
  const canSwitch = hasNames && companies.length > 1 && activeInList && !isError;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'mx-auto flex h-8 w-8 items-center justify-center rounded-xl',
              'bg-secondary text-muted-foreground',
            )}
            aria-label={activeTooltip}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{activeTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  if (!canSwitch) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/60 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Compañía
        </p>
        <div className="mt-1 flex items-center gap-2 min-w-0">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium text-foreground" title={activeTooltip}>
            {activeLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Compañía
      </p>
      <Select
        value={companyId}
        onValueChange={(nextId) => {
          try {
            setActiveCompany(nextId);
          } catch {
            /* invalid company — ignore */
          }
        }}
      >
        <SelectTrigger className="h-10 w-full rounded-xl border-border bg-secondary/60">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Seleccionar compañía" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company._id} value={company._id}>
              {company.name.trim() || shortCompanyId(company._id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
