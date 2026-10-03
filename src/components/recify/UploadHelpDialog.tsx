import type { ReactNode } from 'react';
import {
  Camera,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  FileText,
  Layers3,
  ScanLine,
  Sun,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MAX_TICKET_FILES_PER_BATCH } from '@/utils/upload-file';

type GuidePointProps = {
  children: ReactNode;
  negative?: boolean;
};

function GuidePoint({ children, negative = false }: GuidePointProps) {
  const Icon = negative ? XCircle : CheckCircle2;

  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          negative ? 'text-destructive' : 'text-success',
        )}
      />
      <span>{children}</span>
    </li>
  );
}

function TicketPhotoExamples() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Comparación de fotografías de Ticket">
      <figure className="rounded-xl border border-success/30 bg-success/5 p-3">
        <div className="relative mx-auto h-20 max-w-24 overflow-hidden rounded-lg bg-card shadow-sm">
          <div className="absolute inset-x-3 top-3 space-y-1.5">
            <div className="h-1.5 rounded-full bg-foreground/65" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="mt-2 h-1.5 w-2/3 rounded-full bg-foreground/55" />
          </div>
          <ScanLine aria-hidden="true" className="absolute bottom-2 right-2 h-4 w-4 text-success" />
        </div>
        <figcaption className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
          Foto clara
          <span aria-hidden="true">✓</span>
        </figcaption>
      </figure>

      <figure className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
        <div className="relative mx-auto h-20 max-w-24 overflow-hidden rounded-lg bg-card shadow-sm">
          <div className="absolute inset-x-3 top-3 space-y-1.5 blur-[2px] opacity-60">
            <div className="h-1.5 rounded-full bg-foreground/65" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="h-1 rounded-full bg-foreground/25" />
            <div className="mt-2 h-1.5 w-2/3 rounded-full bg-foreground/55" />
          </div>
          <XCircle aria-hidden="true" className="absolute bottom-2 right-2 h-4 w-4 text-destructive" />
        </div>
        <figcaption className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground">
          <XCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
          Foto borrosa
          <span aria-hidden="true">✕</span>
        </figcaption>
      </figure>
    </div>
  );
}

function TicketUploadGuide() {
  return (
    <section
      aria-labelledby="ticket-upload-guide-title"
      className="group rounded-2xl border border-border/60 bg-card p-4 shadow-elegant transition-colors hover:border-primary/30 motion-safe:animate-fade-in motion-reduce:animate-none motion-reduce:transition-none sm:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-accent p-2.5 text-accent-foreground">
          <Camera aria-hidden="true" className="h-5 w-5 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105 motion-reduce:transition-none" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Tickets</p>
          <h3 id="ticket-upload-guide-title" className="mt-0.5 text-base font-semibold">
            Sube una foto clara de tu Ticket
          </h3>
        </div>
      </div>

      <TicketPhotoExamples />

      <ul className="mt-4 space-y-2.5">
        <GuidePoint>
          <Sun aria-hidden="true" className="mr-1 inline h-4 w-4" />
          Toma la fotografía con buena iluminación.
        </GuidePoint>
        <GuidePoint>Asegúrate de que todo el Ticket aparezca dentro de la imagen.</GuidePoint>
        <GuidePoint negative>Evita fotos borrosas o movidas.</GuidePoint>
        <GuidePoint>
          <Layers3 aria-hidden="true" className="mr-1 inline h-4 w-4" />
          Puedes subir varios Tickets al mismo tiempo.
        </GuidePoint>
        <GuidePoint>Formatos: JPG, PNG, WEBP o GIF · máximo 10 MB por imagen.</GuidePoint>
        <GuidePoint>
          Máximo: <strong className="font-semibold text-foreground">{MAX_TICKET_FILES_PER_BATCH} Tickets por carga</strong>.
        </GuidePoint>
      </ul>
    </section>
  );
}

function InvoiceUploadGuide() {
  return (
    <section
      aria-labelledby="invoice-upload-guide-title"
      className="group rounded-2xl border border-border/60 bg-card p-4 shadow-elegant transition-colors hover:border-primary/30 motion-safe:animate-fade-in motion-reduce:animate-none motion-reduce:transition-none sm:p-5 md:[animation-delay:75ms] md:[animation-fill-mode:both]"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-accent p-2.5 text-accent-foreground">
          <FileText aria-hidden="true" className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Facturas</p>
          <h3 id="invoice-upload-guide-title" className="mt-0.5 text-base font-semibold">
            Sube tu Factura en PDF
          </h3>
        </div>
      </div>

      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-primary/30 bg-accent/40 p-4">
        <div className="text-center">
          <span className="relative mx-auto flex h-16 w-14 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
            <FileText aria-hidden="true" className="h-7 w-7 text-primary" />
            <CheckCircle2 aria-hidden="true" className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full bg-card text-success" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Archivo PDF original</p>
          <p className="text-xs text-muted-foreground">No una fotografía</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        <GuidePoint>
          <FileCheck2 aria-hidden="true" className="mr-1 inline h-4 w-4" />
          Las Facturas deben cargarse en formato <strong className="font-semibold text-foreground">PDF</strong> · máximo 10 MB.
        </GuidePoint>
        <GuidePoint negative>No uses fotografías para este flujo.</GuidePoint>
      </ul>
    </section>
  );
}

export function UploadHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-xl px-3 text-muted-foreground hover:text-foreground active:scale-[0.98] motion-reduce:transition-none"
        >
          <CircleHelp aria-hidden="true" />
          ¿Cómo subir mis archivos?
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 motion-reduce:animate-none motion-reduce:duration-0 sm:p-6">
        <DialogHeader className="pr-10 text-left motion-safe:animate-fade-in motion-reduce:animate-none">
          <DialogTitle className="text-xl">¿Cómo subir tus archivos?</DialogTitle>
          <DialogDescription>
            Elige el formato correcto y revisa estos consejos antes de comenzar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TicketUploadGuide />
          <InvoiceUploadGuide />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className="h-11 w-full rounded-xl sm:w-auto">
              Entendido
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
