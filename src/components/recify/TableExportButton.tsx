import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  exportTable,
  type ExportColumn,
  type ExportFormat,
} from '@/utils/table-export';

interface TableExportButtonProps<T> {
  /** Filas a exportar (normalmente el resultado ya filtrado que ve el usuario). */
  rows: readonly T[];
  columns: ExportColumn<T>[];
  /** Nombre base del archivo, sin extensión. */
  filename: string;
  sheetName?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function TableExportButton<T>({
  rows,
  columns,
  filename,
  sheetName,
  disabled,
  label = 'Exportar',
  className,
}: TableExportButtonProps<T>) {
  const isEmpty = rows.length === 0;
  const isDisabled = disabled || isEmpty;

  const handleExport = (format: ExportFormat) => {
    if (isDisabled) return;
    exportTable(format, { rows, columns, filename, sheetName });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className ?? 'rounded-lg'}
          disabled={isDisabled}
          aria-label={
            isEmpty ? 'No hay datos para exportar' : `${label} tabla en Excel o CSV`
          }
          title={isEmpty ? 'No hay datos para exportar' : undefined}
        >
          <Download size={14} className="mr-2" aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => handleExport('excel')}>
          <FileSpreadsheet size={15} className="mr-2 text-success" aria-hidden />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport('csv')}>
          <FileText size={15} className="mr-2 text-muted-foreground" aria-hidden />
          CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
