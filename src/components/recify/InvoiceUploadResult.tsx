import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InvoiceMatchStatusBadge } from '@/components/recify/InvoiceMatchStatusBadge';
import { InvoiceMatchPanel } from '@/components/recify/InvoiceMatchPanel';
import { useAuth } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/use-companies';
import { getInvoice } from '@/services/invoices.service';
import type { BackendInvoice, UploadInvoiceResponse } from '@/types/invoice';
import {
  INVOICE_TYPE_LABELS,
  formatInvoiceDate,
  formatInvoicePaymentForm,
  formatInvoiceUuid,
  resolveInvoiceFileUrl,
} from '@/utils/invoice-display';
import { HISTORY_TIMEZONE, formatMxn } from '@/utils/financial-kpis';
import { getInvoiceUserErrorMessage, isInvoiceAbortError } from '@/utils/invoice-errors';

interface InvoiceUploadResultProps {
  response: UploadInvoiceResponse;
  /** Compañía origen del upload. */
  companyId: string;
}

/**
 * Resultado de subir un CFDI: resumen extraído + gestión del match.
 * La factura ya quedó persistida en el backend al llegar aquí.
 */
export function InvoiceUploadResult({ response, companyId }: InvoiceUploadResultProps) {
  const [invoice, setInvoice] = useState<BackendInvoice>(response.invoice);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { companyId: activeCompanyId } = useAuth();
  const { activeCompany } = useCompanies();
  const timeZone = activeCompany?.timezone?.trim() || HISTORY_TIMEZONE;

  const fields = [
    { label: 'Emisor', value: invoice.issuerName ?? '—', key: 'issuerName' },
    { label: 'RFC emisor', value: invoice.issuerRfc ?? '—', key: 'issuerRfc' },
    { label: 'Receptor', value: invoice.receiverName ?? '—', key: 'receiverName' },
    { label: 'RFC receptor', value: invoice.receiverRfc ?? '—', key: 'receiverRfc' },
    { label: 'Fecha', value: formatInvoiceDate(invoice.date, timeZone), key: 'date' },
    { label: 'Tipo', value: INVOICE_TYPE_LABELS[invoice.type] ?? invoice.type, key: 'type' },
    {
      label: 'Subtotal',
      value: invoice.subtotal !== null ? formatMxn(invoice.subtotal) : '—',
      key: 'subtotal',
    },
    { label: 'IVA', value: invoice.tax !== null ? formatMxn(invoice.tax) : '—', key: 'tax' },
    {
      label: 'Forma de pago',
      value: formatInvoicePaymentForm(invoice.paymentForm),
      key: 'paymentForm',
    },
    { label: 'Método', value: invoice.paymentMethod ?? '—', key: 'paymentMethod' },
  ];

  const openPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const fresh = await getInvoice(companyId, invoice._id);
      if (activeCompanyId !== companyId) return;
      setInvoice((prev) => ({ ...prev, ...fresh }));
      const pdfUrl = resolveInvoiceFileUrl(fresh.fileUrl);
      if (!pdfUrl) {
        toast.error('No hay un PDF disponible para esta factura.');
        return;
      }
      const popup = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        toast.error(
          'El navegador bloqueó la ventana del PDF. Permite ventanas emergentes e intenta de nuevo.',
        );
      }
    } catch (err) {
      if (isInvoiceAbortError(err) || activeCompanyId !== companyId) return;
      const message = getInvoiceUserErrorMessage(
        err,
        'No se pudo obtener el PDF. Intenta de nuevo.',
      );
      if (message) toast.error(message);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-elegant animate-fade-in">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h3 className="font-semibold text-foreground">Factura registrada</h3>
          <InvoiceMatchStatusBadge status={invoice.matchStatus} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-foreground">{formatMxn(invoice.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Folio fiscal</p>
            <p className="font-mono text-xs break-all text-foreground">
              {formatInvoiceUuid(invoice.uuid)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.key} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="text-sm font-medium text-foreground break-words">{field.value}</p>
            </div>
          ))}
        </div>
      </div>

      <InvoiceMatchPanel
        companyId={companyId}
        activeCompanyId={activeCompanyId}
        invoice={invoice}
        linkedTicket={response.match.ticket}
        initialCandidates={response.match.candidates}
        onInvoiceChange={setInvoice}
        timeZone={timeZone}
      />

      <Button
        variant="outline"
        className="w-full h-11 rounded-xl"
        onClick={() => void openPdf()}
        disabled={pdfBusy}
        aria-label="Abrir PDF de la factura"
      >
        {pdfBusy ? (
          <Loader2 size={16} className="mr-2 animate-spin" />
        ) : (
          <FileText size={16} className="mr-2" />
        )}
        Abrir PDF
      </Button>
    </div>
  );
}
