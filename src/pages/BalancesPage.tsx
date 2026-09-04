import { useState } from 'react';
import { Loader2, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/recify/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BALANCE_ACCOUNT_TYPE_LABELS } from '@/utils/balance-display';
import { useBalances, useDeleteBalance } from '@/hooks/use-balances';
import { useCompanies } from '@/hooks/use-companies';
import { HISTORY_TIMEZONE, formatMxn } from '@/utils/financial-kpis';
import type { BackendBalance } from '@/types/balance';

function formatDate(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function BalanceRow({
  balance,
  timeZone,
  onDelete,
  deleting,
}: {
  balance: BackendBalance;
  timeZone: string;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const currency = balance.currency?.trim() || 'MXN';
  const money = (n: number | null) => (n == null ? '—' : `${formatMxn(n)} ${currency}`);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-elegant">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-accent p-2 text-accent-foreground">
            <Wallet size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {balance.bank || 'Banco no identificado'}
              {balance.accountRef ? ` · ${balance.accountRef}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {BALANCE_ACCOUNT_TYPE_LABELS[balance.accountType]} ·{' '}
              {formatDate(balance.capturedAt, timeZone)}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(balance._id)}
          disabled={deleting}
          aria-label="Eliminar saldo"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-background p-3">
          <p className="text-xs text-muted-foreground">Saldo actual</p>
          <p className="text-base font-bold text-foreground">{money(balance.currentBalance)}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-background p-3">
          <p className="text-xs text-muted-foreground">Crédito disponible</p>
          <p className="text-base font-bold text-foreground">{money(balance.availableCredit)}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-background p-3">
          <p className="text-xs text-muted-foreground">Línea de crédito</p>
          <p className="text-base font-bold text-foreground">{money(balance.creditLimit)}</p>
        </div>
      </div>
    </div>
  );
}

export default function BalancesPage() {
  const [page, setPage] = useState(1);
  const { activeCompany } = useCompanies();
  const timeZone = activeCompany?.timezone?.trim() || HISTORY_TIMEZONE;
  const { data, isLoading, isError } = useBalances({ page, limit: 20 });
  const deleteMutation = useDeleteBalance();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Saldo eliminado.');
    } catch {
      toast.error('No se pudo eliminar el saldo.');
    } finally {
      setDeletingId(null);
    }
  };

  const balances = data?.data ?? [];
  const pages = data?.pages ?? 1;

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saldos</h1>
          <p className="mt-1 text-muted-foreground">
            Capturas de saldo de tus cuentas y tarjetas. No cuentan como ingreso ni gasto.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">No se pudieron cargar los saldos.</p>
        ) : balances.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-8 text-center shadow-elegant">
            <div className="mb-4 rounded-2xl bg-accent p-4 text-accent-foreground">
              <Wallet size={32} />
            </div>
            <h3 className="mb-1 font-semibold text-foreground">Aún no hay saldos</h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              Sube una captura de tu app bancaria o de tarjeta desde “Subir tickets” para
              registrarla aquí.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {balances.map((b) => (
                <BalanceRow
                  key={b._id}
                  balance={b}
                  timeZone={timeZone}
                  onDelete={handleDelete}
                  deleting={deletingId === b._id}
                />
              ))}
            </div>

            {pages > 1 ? (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  Siguiente
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppLayout>
  );
}
