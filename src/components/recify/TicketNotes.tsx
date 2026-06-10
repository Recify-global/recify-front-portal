import { getTicketNoteSections } from '@/utils/ticket-display';

interface TicketNotesProps {
  sources: unknown[];
  title?: string;
}

export function TicketNotes({ sources, title = 'Información adicional' }: TicketNotesProps) {
  const notes = getTicketNoteSections(...sources);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{title}</p>
      {notes.details.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
          {notes.details.slice(0, 10).map((section) => (
            <div key={`${section.label}-${section.value}`} className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{section.label}</p>
              <p className="text-sm font-medium text-foreground break-words">{section.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{notes.fallback}</p>
      )}
    </div>
  );
}
