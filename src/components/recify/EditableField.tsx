import { useRef, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

const HINT_OFFSET_X = 12;
const HINT_OFFSET_Y = -10;
const HINT_SIZE = 14;

function hideEditHint(hint: HTMLElement | null) {
  if (!hint) return;
  hint.dataset.visible = 'false';
  delete hint.dataset.mode;
}

function movePointerHint(hint: HTMLElement | null, event: React.MouseEvent<HTMLElement>) {
  if (!hint) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left + HINT_OFFSET_X;
  const y = event.clientY - rect.top + HINT_OFFSET_Y;
  const maxX = Math.max(0, rect.width - HINT_SIZE);
  const maxY = Math.max(0, rect.height - HINT_SIZE);
  hint.style.transform = `translate(${Math.min(Math.max(0, x), maxX)}px, ${Math.min(Math.max(0, y), maxY)}px)`;
  hint.dataset.mode = 'pointer';
  hint.dataset.visible = 'true';
}

function pinFocusHint(hint: HTMLElement | null) {
  if (!hint) return;
  hint.style.transform = '';
  hint.dataset.mode = 'focus';
  hint.dataset.visible = 'true';
}

export interface EditableFieldProps {
  label: string;
  className?: string;
  children: ReactNode;
  onStartEdit: () => void;
  disabled?: boolean;
  cellDataAttr?: string;
  hintDataAttr?: string;
}

/**
 * Presentational hover/focus/keyboard field. No ticket IDs, PATCH, or company.
 */
export function EditableField({
  label,
  className,
  children,
  onStartEdit,
  disabled,
  cellDataAttr = 'data-editable-field',
  hintDataAttr = 'data-editable-hint',
}: EditableFieldProps) {
  const hintRef = useRef<HTMLSpanElement>(null);

  return (
    <div
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? -1 : 0}
      aria-label={disabled ? undefined : label}
      {...{ [cellDataAttr]: '' }}
      className={cn(
        'relative rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
        disabled && 'pointer-events-none cursor-default',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onStartEdit();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onStartEdit();
        }
      }}
      onMouseEnter={(event) => {
        if (!disabled) movePointerHint(hintRef.current, event);
      }}
      onMouseMove={(event) => {
        if (!disabled) movePointerHint(hintRef.current, event);
      }}
      onMouseLeave={() => hideEditHint(hintRef.current)}
      onFocus={() => {
        if (!disabled) pinFocusHint(hintRef.current);
      }}
      onBlur={() => hideEditHint(hintRef.current)}
    >
      {children}
      <span
        ref={hintRef}
        aria-hidden
        {...{ [hintDataAttr]: '' }}
        data-visible="false"
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-10 text-muted-foreground',
          'opacity-0 transition-opacity duration-150',
          '[@media(hover:none)]:opacity-70',
          'data-[mode=focus]:left-auto data-[mode=focus]:right-1 data-[mode=focus]:top-1/2 data-[mode=focus]:-translate-y-1/2',
          'data-[mode=focus]:opacity-100',
          '[@media(hover:hover)]:data-[mode=pointer]:data-[visible=true]:opacity-100',
        )}
      >
        <Pencil size={12} />
      </span>
    </div>
  );
}
