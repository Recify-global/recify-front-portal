import { useState } from 'react';
import { getTicketNoteSections } from '@/utils/ticket-display';
import { Button } from '@/components/ui/button';

interface TicketNotesProps {
  sources: unknown[];
  title?: string;
}

export function TicketNotes({ sources, title = 'Información adicional' }: TicketNotesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const notes = getTicketNoteSections(...sources);
  const visibleDetails = isExpanded ? notes.details : notes.details.slice(0, 6);
  const canExpand = notes.details.length > 6;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{title}</p>
      {notes.details.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
          {visibleDetails.map((section) => (
            <div key={`${section.label}-${section.value}`} className="space-y-0.5">
              {section.label === 'Producto / concepto' ? null : (
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{section.label}</p>
              )}
              <p className="text-sm font-medium text-foreground break-words">{section.value}</p>
            </div>
          ))}
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-0 text-xs font-medium text-primary hover:bg-transparent hover:text-primary/80"
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? 'Mostrar menos' : 'Ver todos'}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{notes.fallback}</p>
      )}
    </div>
  );
}
