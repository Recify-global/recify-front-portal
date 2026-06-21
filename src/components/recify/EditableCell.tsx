import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Pencil, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EditableSelectOption {
  value: string;
  label: string;
}

interface BaseProps {
  /** Lo que se ve cuando NO está en modo edición (badge, texto formateado, etc.). */
  display: ReactNode;
  /** Si el campo está deshabilitado para edición. */
  disabled?: boolean;
  /** Llamado al confirmar un cambio. Debe ser async para que el spinner se vea. */
  onSave: (next: string) => Promise<void> | void;
  className?: string;
}

type EditableCellProps = BaseProps &
  (
    | {
        mode: 'text';
        value: string;
        placeholder?: string;
      }
    | {
        mode: 'number';
        value: number;
        step?: number;
        min?: number;
      }
    | {
        mode: 'date';
        /** ISO o YYYY-MM-DD; el componente lo normaliza para <input type="date">. */
        value: string;
      }
    | {
        mode: 'select';
        value: string;
        options: EditableSelectOption[];
      }
  );

/**
 * Celda editable estilo Excel. Por defecto muestra `display`; al hacer hover
 * aparece un lápiz en la esquina; al hacer clic (o doble-clic en la celda)
 * cambia a modo edición.
 *
 * - Enter o blur → guarda.
 * - Esc → cancela.
 * - Mientras `onSave` esté en curso, se muestra un spinner.
 */
export function EditableCell(props: EditableCellProps) {
  const { display, disabled, onSave, className, mode } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => toDraft(props));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(toDraft(props));
  }, [editing, props]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select?.();
      }
    }
  }, [editing]);

  const enterEdit = useCallback(() => {
    if (disabled || saving) return;
    setError(null);
    setEditing(true);
  }, [disabled, saving]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(toDraft(props));
    setError(null);
  }, [props]);

  const commit = useCallback(async () => {
    if (draft === toDraft(props)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, props]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  // -- Modo display --
  if (!editing) {
    return (
      <button
        type="button"
        onDoubleClick={enterEdit}
        disabled={disabled}
        className={cn(
          'group relative inline-flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left',
          !disabled && 'hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          disabled && 'cursor-default',
          className,
        )}
        title={disabled ? undefined : 'Doble clic o lápiz para editar'}
        onClick={(e) => {
          // Permitimos un solo clic en el lápiz, no en toda la celda
          if ((e.target as HTMLElement).closest('[data-pencil]')) {
            e.preventDefault();
            enterEdit();
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        {!disabled && (
          <Pencil
            data-pencil
            size={12}
            className="opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 shrink-0"
          />
        )}
        {saving && <Loader2 size={12} className="animate-spin text-primary shrink-0" />}
        {error && !saving && (
          <span title={error} className="text-destructive shrink-0">
            <X size={12} />
          </span>
        )}
      </button>
    );
  }

  // -- Modo edit --
  const commonClass =
    'h-7 w-full rounded-md border border-primary/60 bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';

  let input: ReactNode = null;
  if (mode === 'text') {
    input = (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        placeholder={props.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        className={commonClass}
      />
    );
  } else if (mode === 'number') {
    input = (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        inputMode="decimal"
        value={draft}
        step={props.step ?? 0.01}
        min={props.min ?? 0}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        className={cn(commonClass, 'text-right')}
      />
    );
  } else if (mode === 'date') {
    input = (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        className={commonClass}
      />
    );
  } else if (mode === 'select') {
    input = (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        className={commonClass}
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className={cn('relative flex items-center gap-1.5', className)}>
      <div className="min-w-0 flex-1">{input}</div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void commit()}
        disabled={saving}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving && <Loader2 size={12} className="animate-spin" />}
        Guardar
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={cancel}
        disabled={saving}
        className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent/40 disabled:opacity-50"
      >
        <X size={12} />
      </button>
      {error && (
        <span
          className="absolute -bottom-5 left-0 text-xs text-destructive whitespace-nowrap"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

function toDraft(props: EditableCellProps): string {
  switch (props.mode) {
    case 'number':
      return String(props.value ?? 0);
    case 'date': {
      const raw = props.value;
      if (!raw) return '';
      // Si ya es YYYY-MM-DD, devolverlo. Si es ISO completo, recortar.
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    default:
      return String(props.value ?? '');
  }
}
