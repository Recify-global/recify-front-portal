import type { BalanceAccountType } from '@/types/balance';

export const BALANCE_ACCOUNT_TYPE_LABELS: Record<BalanceAccountType, string> = {
  credit_card: 'Tarjeta de crédito',
  debit: 'Tarjeta de débito',
  bank_account: 'Cuenta bancaria',
  other: 'Otra',
};
