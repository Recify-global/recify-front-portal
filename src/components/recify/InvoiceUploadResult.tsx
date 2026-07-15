import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceMatchStatusBadge } from '@/components/recify/InvoiceMatchStatusBadge';
import { InvoiceMatchPanel } from '@/components/recify/InvoiceMatchPanel';
import type { BackendInvoice, UploadInvoiceResponse } from '@/types/invoice';
import {
  INVOICE_TYPE_LABELS,
  formatInvoiceDate,
  formatInvoicePaymentForm,
} from '@/utils/invoice-display';
import { formatMxn } from '@/utils/financial-kpis';

interface InvoiceUploadResultProps {
  response: UploadInvoiceResponse;
}

/**
 * Resultado de subir un CFDI: resumen extraído + gestión del match.
 * La factura ya quedó persistida en el backend al llegar aquí.
 */
export function InvoiceUploadResult({ response }: InvoiceUploadResultProps) {
  const [invoice, setInvoice] = useState<BackendInvoice>(response.invoice);

  const fields = [
    { label: 'Emisor', value: invoice.issuerName ?? '—', key: 'issuerName' },
    { label: 'RFC emisor', value: invoice.issuerRfc ?? '—', key: 'issuerRfc' },
    { label: 'Receptor', value: invoice.receiverName ?? '—', key: 'receiverName' },
    { label: 'RFC receptor', value: invoice.receiverRfc ?? '—', key: 'receiverRfc' },
    { label: 'Fecha', value: formatInvoiceDate(invoice.date), key: 'date' },
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

  return (
    <div className="space-y-4">
      {/* Resumen */}
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
            <p className="font-mono text-xs break-all text-foreground">{invoice.uuid}</p>
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

      {/* Match */}
      <InvoiceMatchPanel
        invoice={invoice}
        linkedTicket={response.match.ticket}
        initialCandidates={response.match.candidates}
        onInvoiceChange={setInvoice}
      />

      <Button
        variant="outline"
        className="w-full h-11 rounded-xl"
        onClick={() =>
          window.open(invoice.fileUrl || response.fileUrl, '_blank', 'noopener,noreferrer')
        }
      >
        <FileText size={16} className="mr-2" /> Abrir PDF
      </Button>
    </div>
  );
}
