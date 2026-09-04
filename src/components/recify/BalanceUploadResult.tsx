import { CheckCircle2, Loader2, Save, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BalanceAccountType } from '@/types/balance';
import { BALANCE_ACCOUNT_TYPE_LABELS } from '@/utils/balance-display';

export interface BalanceLike {
  bank?: string | null;
  accountType?: BalanceAccountType | null;
  accountRef?: string | null;
  currentBalance?: number | null;
  availableCredit?: number | null;
  creditLimit?: number | null;
  currency?: string | null;
}

interface BalanceUploadResultProps {
  balance: BalanceLike;
  /** true = ya persistido (confirmación); false = analizado, pendiente de registrar. */
  saved: boolean;
  /** Registrar el saldo (solo en modo preview). */
  onConfirm?: () => void;
  confirming?: boolean;
  disabled?: boolean;
}

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currency}`;
}

export function BalanceUploadResult({
  balance,
  saved,
  onConfirm,
  confirming,
  disabled,
}: BalanceUploadResultProps) {
  const currency = balance.currency?.trim() || 'MXN';
  const accountType = balance.accountType ?? 'other';

  const figures = [
    { label: 'Saldo actual', value: balance.currentBalance, key: 'currentBalance' },
    { label: 'Crédito disponible', value: balance.availableCredit, key: 'availableCredit' },
    { label: 'Línea de crédito', value: balance.creditLimit, key: 'creditLimit' },
  ].filter((f) => f.value != null);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-elegant animate-fade-in">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-accent p-2 text-accent-foreground">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {saved ? 'Saldo registrado' : 'Captura de saldo detectada'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {balance.bank || 'Banco no identificado'}
                {balance.accountRef ? ` · ${balance.accountRef}` : ''}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {BALANCE_ACCOUNT_TYPE_LABELS[accountType]}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {figures.map((f) => (
            <div key={f.key} className="rounded-xl border border-border/50 bg-background p-3">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="text-lg font-bold text-foreground">{formatMoney(f.value, currency)}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Los saldos no se cuentan como ingreso ni gasto: solo registran el estado de la cuenta.
        </p>
      </div>

      {!saved && onConfirm ? (
        <Button
          className="h-11 w-full rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
          onClick={onConfirm}
          disabled={disabled || confirming}
        >
          {confirming ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Save size={16} className="mr-2" />
          )}
          Registrar saldo
        </Button>
      ) : null}

      {saved ? (
        <div className="flex items-center justify-center gap-2 text-sm text-success">
          <CheckCircle2 size={16} />
          Guardado en tus saldos
        </div>
      ) : null}
    </div>
  );
}
